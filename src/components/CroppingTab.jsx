import { useState } from 'react';
import { parseCSV, cropAndSaveImagesStreaming } from '../utils/imageCropping';
import { pickMultipleImages, pickImageDirectory } from '../utils/fileSystemAccess';

export default function CroppingTab() {
    const [csvFile, setCsvFile] = useState(null);
    const [imageFiles, setImageFiles] = useState([]);
    const [status, setStatus] = useState('idle'); // idle, processing, complete
    const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
    const [results, setResults] = useState(null);

    const handleCSVSelect = async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: 'CSV Files',
                        accept: { 'text/csv': ['.csv'] }
                    }
                ],
                multiple: false
            });
            const file = await fileHandle.getFile();
            setCsvFile(file);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error selecting CSV:', err);
            }
        }
    };

    const handleImagesSelect = async () => {
        const files = await pickMultipleImages();
        if (files.length > 0) {
            setImageFiles(files);
        }
    };

    const handleImageFolderSelect = async () => {
        const files = await pickImageDirectory();
        if (files.length > 0) {
            setImageFiles(files);
        }
    };

    const handleProcess = async () => {
        if (!csvFile || imageFiles.length === 0) {
            alert('Please select both CSV file and images');
            return;
        }

        setStatus('processing');
        setResults(null);

        try {
            // Read CSV content
            const csvContent = await csvFile.text();
            const csvData = parseCSV(csvContent);

            if (csvData.length === 0) {
                alert('CSV file is empty or invalid');
                setStatus('idle');
                return;
            }

            // Ask user to select output directory first
            const outputDirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            // Process and save images in streaming mode (saves as it processes)
            const saveResults = await cropAndSaveImagesStreaming(
                csvData,
                imageFiles,
                outputDirHandle,
                (current, total, message) => {
                    setProgress({ current, total, message });
                }
            );

            if (saveResults.saved === 0 && saveResults.failed === 0) {
                alert('No crops generated. Check if image filenames match CSV data or if all detections were filtered out (score < 0.5).');
                setStatus('idle');
                return;
            }

            setResults(saveResults);
            setStatus('complete');
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('User cancelled directory picker');
            } else {
                console.error('Error processing crops:', err);
                alert('Error processing crops: ' + err.message);
            }
            setStatus('idle');
        }
    };

    return (
        <div className="flex flex-col gap-4 w-full p-4">
            <div className="text-center mb-2">
                <h2 className="text-xl font-semibold mb-2">Crop Images from Detection Results</h2>
                <p className="text-sm text-gray-600">
                    Select a CSV file with bounding box data and the corresponding images to crop regions.
                </p>
            </div>

            <div className="flex gap-4">
                {/* Left column - Input selection */}
                <div className="flex flex-col gap-3 w-1/2">
                    <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium">1. Select CSV File</span>
                        <button
                            className="border px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed"
                            onClick={handleCSVSelect}
                            disabled={status === 'processing'}
                        >
                            {csvFile ? csvFile.name : 'Select CSV File'}
                        </button>
                        <p className="text-xs text-gray-500">
                            CSV should contain columns: image, label, xmin, ymin, xmax, ymax
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium">2. Select Images to Crop</span>
                        <div className="flex gap-2">
                            <button
                                className="border px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed flex-1"
                                onClick={handleImagesSelect}
                                disabled={status === 'processing'}
                            >
                                Select Files
                            </button>
                            <button
                                className="border px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed flex-1"
                                onClick={handleImageFolderSelect}
                                disabled={status === 'processing'}
                            >
                                Select Folder
                            </button>
                        </div>
                        {imageFiles.length > 0 && (
                            <p className="text-xs text-gray-600">
                                {imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''} selected
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 mt-2">
                        <span className="text-sm font-medium">3. Process & Save</span>
                        <button
                            className="border px-4 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-200 disabled:cursor-not-allowed font-medium"
                            onClick={handleProcess}
                            disabled={status === 'processing' || !csvFile || imageFiles.length === 0}
                        >
                            {status === 'processing' ? 'Processing...' : 'Crop and Save Images'}
                        </button>
                        <p className="text-xs text-gray-500">
                            You'll be asked to select an output folder. Crops will be organized by label.
                        </p>
                    </div>
                </div>

                {/* Right column - Progress and results */}
                <div className="flex flex-col gap-3 w-1/2">
                    <span className="text-sm font-medium">Progress</span>
                    <div className="border border-gray-300 rounded-md p-4 h-[300px] flex flex-col justify-center items-center">
                        {status === 'idle' && (
                            <p className="text-sm text-gray-500">Ready to process</p>
                        )}

                        {status === 'processing' && (
                            <div className="w-full">
                                <p className="text-sm font-medium mb-2">
                                    Processing: {progress.current} / {progress.total}
                                </p>
                                <p className="text-xs text-gray-600 mb-3 truncate">
                                    {progress.message}
                                </p>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-500 h-2 rounded-full transition-all"
                                        style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {status === 'complete' && results && (
                            <div className="text-center">
                                <div className="mb-4">
                                    <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-lg font-semibold mb-2">Cropping Complete!</p>
                                <p className="text-sm text-gray-600">
                                    Successfully saved: {results.saved} crops
                                </p>
                                {results.skipped > 0 && (
                                    <p className="text-sm text-orange-600 mt-1">
                                        Skipped: {results.skipped} crops (low confidence or missing images)
                                    </p>
                                )}
                                {results.failed > 0 && (
                                    <p className="text-sm text-red-600 mt-1">
                                        Failed: {results.failed} crops
                                    </p>
                                )}
                                <button
                                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                    onClick={() => {
                                        setStatus('idle');
                                        setResults(null);
                                        setProgress({ current: 0, total: 0, message: '' });
                                    }}
                                >
                                    Process Another Batch
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
