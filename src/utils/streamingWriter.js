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
    }

    async initialize(task) {
        this.writable = await this.fileHandle.createWritable();
        // Write opening bracket
        await this.writable.write('[\n');
        this.task = task;
        this.isFirst = true;
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
    }

    async initialize() {
        this.writable = await this.fileHandle.createWritable();
        this.headers = null;
    }

    async writeResult(item) {
        if (!this.writable) throw new Error('Writer not initialized');

        // Flatten the result
        const flatItems = [];
        if (Array.isArray(item.result)) {
            flatItems.push(...item.result);
        } else if (item.result && typeof item.result === 'object') {
            flatItems.push({ filename: item.filename, result: JSON.stringify(item.result) });
        } else {
            flatItems.push({ filename: item.filename, result: item.result });
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
    }

    async initialize(task) {
        this.task = task;
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
        // Nothing to finalize for individual files
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
