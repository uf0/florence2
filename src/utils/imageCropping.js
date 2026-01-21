/**
 * Crop bounding boxes from images and save them
 */

/**
 * Load an image file and return canvas context
 * @param {File} file - Image file
 * @returns {Promise<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, width: number, height: number}>}
 */
async function loadImageToCanvas(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve({ canvas, ctx, width: img.width, height: img.height });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Crop a region from canvas and return as blob
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas
 * @param {Object} bbox - Bounding box {xmin, ymin, xmax, ymax}
 * @param {number} imageWidth - Original image width
 * @param {number} imageHeight - Original image height
 * @returns {Promise<Blob>}
 */
async function cropRegion(sourceCanvas, bbox, imageWidth, imageHeight) {
    const { xmin, ymin, xmax, ymax } = bbox;
    
    // Clamp coordinates to image boundaries
    const left = Math.max(0, Math.min(xmin, imageWidth));
    const top = Math.max(0, Math.min(ymin, imageHeight));
    const right = Math.max(0, Math.min(xmax, imageWidth));
    const bottom = Math.max(0, Math.min(ymax, imageHeight));
    
    const width = right - left;
    const height = bottom - top;
    
    if (width <= 0 || height <= 0) {
        throw new Error('Invalid crop dimensions');
    }
    
    // Create a new canvas for the cropped region
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const ctx = cropCanvas.getContext('2d');
    
    // Draw the cropped region
    ctx.drawImage(
        sourceCanvas,
        left, top, width, height,
        0, 0, width, height
    );
    
    // Convert to blob
    return new Promise((resolve, reject) => {
        cropCanvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob'));
            }
        }, 'image/jpeg', 0.95);
    });
}

/**
 * Parse CSV content into array of objects
 * @param {string} csvContent - CSV file content
 * @returns {Array<Object>}
 */
export function parseCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => {
            const value = values[index];
            // Try to parse numbers
            obj[header] = isNaN(value) ? value : parseFloat(value);
        });
        data.push(obj);
    }
    
    return data;
}

/**
 * Process images and crop bounding boxes, saving them immediately as a stream
 * @param {Array} csvData - Parsed CSV data with bbox info
 * @param {Array<File>} imageFiles - Array of image files
 * @param {FileSystemDirectoryHandle} outputDirHandle - Output directory handle
 * @param {Function} progressCallback - Progress callback (current, total, message)
 * @returns {Promise<{saved: number, failed: number, skipped: number}>}
 */
export async function cropAndSaveImagesStreaming(csvData, imageFiles, outputDirHandle, progressCallback) {
    // Group CSV data by image filename
    const groupedData = {};
    csvData.forEach(row => {
        const filename = row.image || row.filename;
        if (!filename) return;
        
        if (!groupedData[filename]) {
            groupedData[filename] = [];
        }
        groupedData[filename].push(row);
    });
    
    // Create a map of image files by name
    const imageMap = {};
    imageFiles.forEach(file => {
        imageMap[file.name] = file;
    });
    
    // Create label subdirectories cache
    const labelDirHandles = {};
    
    const totalImages = Object.keys(groupedData).length;
    let processedImages = 0;
    let saved = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const [filename, bboxes] of Object.entries(groupedData)) {
        const imageFile = imageMap[filename];
        
        if (!imageFile) {
            progressCallback(processedImages + 1, totalImages, `Skipping ${filename} (not found)`);
            processedImages++;
            skipped += bboxes.length;
            continue;
        }
        
        progressCallback(processedImages + 1, totalImages, `Processing ${filename}`);
        
        try {
            const { canvas, width, height } = await loadImageToCanvas(imageFile);
            
            for (let index = 0; index < bboxes.length; index++) {
                const bbox = bboxes[index];
                const score = bbox.score || 1.0;
                
                // Skip low confidence detections if score is provided
                if (score < 0.5) {
                    skipped++;
                    continue;
                }
                
                try {
                    const blob = await cropRegion(canvas, {
                        xmin: bbox.xmin,
                        ymin: bbox.ymin,
                        xmax: bbox.xmax,
                        ymax: bbox.ymax
                    }, width, height);
                    
                    const label = bbox.label || 'unknown';
                    const baseFilename = filename.split('.')[0];
                    const croppedFilename = `${baseFilename}_${index}.jpg`;
                    
                    // Get or create label subdirectory
                    if (!labelDirHandles[label]) {
                        labelDirHandles[label] = await outputDirHandle.getDirectoryHandle(label, { create: true });
                    }
                    
                    // Save immediately
                    const fileHandle = await labelDirHandles[label].getFileHandle(croppedFilename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    
                    saved++;
                } catch (error) {
                    console.error(`Error cropping bbox ${index} from ${filename}:`, error);
                    failed++;
                }
            }
        } catch (error) {
            console.error(`Error processing ${filename}:`, error);
            failed += bboxes.length;
        }
        
        processedImages++;
    }
    
    return { saved, failed, skipped };
}

/**
 * Save cropped images to directory structure organized by label
 * @deprecated Use cropAndSaveImagesStreaming instead for better memory efficiency
 * @param {Array} croppedImages - Array of cropped images from cropImagesFromCSV
 * @param {FileSystemDirectoryHandle} outputDirHandle - Output directory handle
 * @returns {Promise<{saved: number, failed: number}>}
 */
export async function saveCroppedImages(croppedImages, outputDirHandle) {
    let saved = 0;
    let failed = 0;
    
    // Group by label
    const groupedByLabel = {};
    croppedImages.forEach(item => {
        if (!groupedByLabel[item.label]) {
            groupedByLabel[item.label] = [];
        }
        groupedByLabel[item.label].push(item);
    });
    
    // Save each group in its own folder
    for (const [label, items] of Object.entries(groupedByLabel)) {
        try {
            // Create subdirectory for label
            const labelDirHandle = await outputDirHandle.getDirectoryHandle(label, { create: true });
            
            // Save each cropped image
            for (const item of items) {
                try {
                    const fileHandle = await labelDirHandle.getFileHandle(item.filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(item.blob);
                    await writable.close();
                    saved++;
                } catch (error) {
                    console.error(`Failed to save ${item.filename}:`, error);
                    failed++;
                }
            }
        } catch (error) {
            console.error(`Failed to create directory for label ${label}:`, error);
            failed += items.length;
        }
    }
    
    return { saved, failed };
}
