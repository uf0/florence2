import { useState } from 'react';
import { pickMultipleImages, pickImageDirectory } from '../utils/fileSystemAccess';

export default function BatchImageInput({ onImagesSelected, disabled }) {
    const [selectedFiles, setSelectedFiles] = useState([]);

    const handleFileSelect = async () => {
        const files = await pickMultipleImages();
        if (files.length > 0) {
            setSelectedFiles(files);
            onImagesSelected(files);
        }
    };

    const handleDirectorySelect = async () => {
        const files = await pickImageDirectory();
        if (files.length > 0) {
            setSelectedFiles(files);
            onImagesSelected(files);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm mb-0.5">Batch Input Images</span>
            <div className="flex gap-2">
                <button
                    className="border px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed text-sm"
                    onClick={handleFileSelect}
                    disabled={disabled}
                >
                    Select Files
                </button>
                <button
                    className="border px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed text-sm"
                    onClick={handleDirectorySelect}
                    disabled={disabled}
                >
                    Select Folder
                </button>
            </div>
            {selectedFiles.length > 0 && (
                <div className="text-sm text-gray-600">
                    {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
                </div>
            )}
        </div>
    );
}
