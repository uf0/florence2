/**
 * Streaming file writer utilities for batch processing
 */

/**
 * Create a streaming JSON writer for batch results
 * Opens a file and writes results one by one
 */
export class StreamingJSONWriter {
    constructor(fileHandle) {
        this.fileHandle = fileHandle;
        this.writable = null;
        this.isFirst = true;
        this.pendingWrites = []; // Track pending write promises
    }

    async initialize(task) {
        this.writable = await this.fileHandle.createWritable();
        // Write opening bracket
        await this.writable.write('[\n');
        this.task = task;
        this.isFirst = true;
        this.pendingWrites = [];
    }

    async writeResult(item) {
        if (!this.writable) throw new Error('Writer not initialized');

        if (!this.isFirst) {
            await this.writable.write(',\n');
        }
        this.isFirst = false;

        const resultObject = {
            filename: item.filename,
            task: this.task,
            result: item.rawResult || item.result,
            time: item.time,
            ...(item.error && { error: item.error })
        };

        await this.writable.write('  ' + JSON.stringify(resultObject, null, 2).replace(/\n/g, '\n  '));
    }

    async finalize() {
        if (!this.writable) return;
        // Wait for all pending writes to complete
        await Promise.all(this.pendingWrites);
        await this.writable.write('\n]\n');
        await this.writable.close();
        this.writable = null;
    }
}

/**
 * Create a streaming CSV writer for batch results
 */
export class StreamingCSVWriter {
    constructor(fileHandle) {
        this.fileHandle = fileHandle;
        this.writable = null;
        this.headers = null;
        this.rowId = 0; // Track unique ID for each row
        this.pendingWrites = []; // Track pending write promises
    }

    async initialize() {
        this.writable = await this.fileHandle.createWritable();
        this.headers = null;
        this.rowId = 0;
        this.pendingWrites = [];
    }

    async writeResult(item) {
        if (!this.writable) throw new Error('Writer not initialized');

        // Flatten the result
        const flatItems = [];
        
        // Handle OCR_WITH_REGION format with quad_boxes
        if (item.result && item.result.labels && item.result.quad_boxes) {
            const { labels, quad_boxes } = item.result;
            for (let i = 0; i < labels.length; i++) {
                flatItems.push({
                    id: this.rowId++,
                    filename: item.filename,
                    label: labels[i],
                    x1: quad_boxes[i][0],
                    y1: quad_boxes[i][1],
                    x2: quad_boxes[i][2],
                    y2: quad_boxes[i][3],
                    x3: quad_boxes[i][4],
                    y3: quad_boxes[i][5],
                    x4: quad_boxes[i][6],
                    y4: quad_boxes[i][7]
                });
            }
        } else if (item.result && item.result.labels && item.result.bboxes) {
            // Handle OD (Object Detection) format with bboxes
            const { labels, bboxes } = item.result;
            for (let i = 0; i < labels.length; i++) {
                flatItems.push({
                    id: this.rowId++,
                    filename: item.filename,
                    label: labels[i],
                    xmin: bboxes[i][0],
                    ymin: bboxes[i][1],
                    xmax: bboxes[i][2],
                    ymax: bboxes[i][3]
                });
            }
        } else if (Array.isArray(item.result)) {
            // Add ID to each item in array
            flatItems.push(...item.result.map(r => ({ id: this.rowId++, ...r })));
        } else if (item.result && typeof item.result === 'object') {
            flatItems.push({ id: this.rowId++, filename: item.filename, result: JSON.stringify(item.result) });
        } else {
            flatItems.push({ id: this.rowId++, filename: item.filename, result: item.result });
        }

        for (const flatItem of flatItems) {
            // Write headers on first row
            if (!this.headers) {
                this.headers = Object.keys(flatItem);
                await this.writable.write(this.headers.join(',') + '\n');
            }

            // Write row
            const values = this.headers.map(header => {
                const value = flatItem[header];
                // Escape values that contain commas or quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value ?? '';
            });
            await this.writable.write(values.join(',') + '\n');
        }
    }

    async finalize() {
        if (!this.writable) return;
        // Wait for all pending writes to complete
        await Promise.all(this.pendingWrites);
        await this.writable.close();
        this.writable = null;
    }
}

/**
 * Create a streaming individual files writer
 */
export class StreamingIndividualWriter {
    constructor(dirHandle) {
        this.dirHandle = dirHandle;
        this.task = null;
        this.pendingWrites = []; // Track pending write promises
    }

    async initialize(task) {
        this.task = task;
        this.pendingWrites = [];
    }

    async writeResult(item) {
        if (!this.dirHandle) throw new Error('Writer not initialized');

        const resultObject = {
            filename: item.filename,
            task: this.task,
            result: item.rawResult || item.result,
            time: item.time,
            ...(item.error && { error: item.error })
        };

        const fileHandle = await this.dirHandle.getFileHandle(`${item.filename}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(resultObject, null, 2));
        await writable.close();
    }

    async finalize() {
        // Wait for all pending writes to complete
        await Promise.all(this.pendingWrites);
    }
}

/**
 * Factory function to create appropriate writer based on format
 */
export async function createStreamingWriter(format, task) {
    let writer;
    
    if (format === 'json') {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: `florence2_results_${Date.now()}.json`,
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }],
            startIn: 'documents'
        });
        writer = new StreamingJSONWriter(fileHandle);
        await writer.initialize(task);
    } else if (format === 'csv') {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: `florence2_results_${Date.now()}.csv`,
            types: [{
                description: 'CSV Files',
                accept: { 'text/csv': ['.csv'] }
            }],
            startIn: 'documents'
        });
        writer = new StreamingCSVWriter(fileHandle);
        await writer.initialize();
    } else if (format === 'individual') {
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'documents'
        });
        writer = new StreamingIndividualWriter(dirHandle);
        await writer.initialize(task);
    } else {
        throw new Error(`Unknown format: ${format}`);
    }

    return writer;
}
