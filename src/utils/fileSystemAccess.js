/**
 * Utility functions for File System Access API
 */

/**
 * Open a directory picker and return files from the selected directory
 * @returns {Promise<File[]>} Array of image files
 */
export async function pickImageDirectory() {
    try {
        const dirHandle = await window.showDirectoryPicker({
            mode: 'read',
            startIn: 'pictures'
        });

        const files = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                // Check if it's an image file
                if (file.type.startsWith('image/')) {
                    files.push(file);
                }
            }
        }

        return files;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled directory picker');
            return [];
        }
        throw err;
    }
}

/**
 * Open multiple file picker for images
 * @returns {Promise<File[]>} Array of selected image files
 */
export async function pickMultipleImages() {
    try {
        const fileHandles = await window.showOpenFilePicker({
            types: [
                {
                    description: 'Images',
                    accept: {
                        'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
                    }
                }
            ],
            multiple: true,
            startIn: 'pictures'
        });

        const files = await Promise.all(
            fileHandles.map(handle => handle.getFile())
        );

        return files;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled file picker');
            return [];
        }
        throw err;
    }
}

/**
 * Save results to a JSON file
 * @param {Object} data - Data to save
 * @param {string} suggestedName - Suggested filename
 */
export async function saveJSONFile(data, suggestedName = 'results.json') {
    try {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [
                {
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }
            ],
            startIn: 'documents'
        });

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();

        return true;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled save');
            return false;
        }
        throw err;
    }
}

/**
 * Save results to a CSV file
 * @param {Array} data - Array of objects to save as CSV
 * @param {string} suggestedName - Suggested filename
 */
export async function saveCSVFile(data, suggestedName = 'results.csv') {
    try {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [
                {
                    description: 'CSV Files',
                    accept: { 'text/csv': ['.csv'] }
                }
            ],
            startIn: 'documents'
        });

        // Convert data to CSV
        if (data.length === 0) {
            throw new Error('No data to save');
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    // Escape values that contain commas or quotes
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        const writable = await fileHandle.createWritable();
        await writable.write(csvContent);
        await writable.close();

        return true;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled save');
            return false;
        }
        throw err;
    }
}

/**
 * Save a directory of results (creates multiple files)
 * @param {Array} results - Array of {filename: string, data: Object} objects
 */
export async function saveResultsDirectory(results) {
    try {
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });

        for (const result of results) {
            const fileHandle = await dirHandle.getFileHandle(result.filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(result.data, null, 2));
            await writable.close();
        }

        return true;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('User cancelled directory picker');
            return false;
        }
        throw err;
    }
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported() {
    return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window && 'showDirectoryPicker' in window;
}
