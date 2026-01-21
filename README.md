# Florence2 WebGPU - Batch Processing

A web application for running Florence-2 vision model with WebGPU acceleration. Supports both single image and batch processing modes with file saving capabilities using the File System Access API.

## Features

- **Single Image Mode**: Process individual images with various vision tasks
- **Batch Processing Mode**: Process multiple images at once
- **Image Cropping Mode**: Crop detected regions from images based on CSV results
- **File System Access API**: 
  - Select multiple image files or an entire folder
  - Save results as JSON, CSV, or individual files per image
  - Crop and organize detected objects into labeled folders
- **WebGPU Acceleration**: Fast inference using GPU acceleration
- **Multiple Tasks Support**:
  - Caption (simple, detailed, more detailed)
  - Object Detection (OD)
  - OCR and OCR with Region
  - Dense Region Caption
  - Caption to Phrase Grounding

## Browser Compatibility

- **WebGPU**: Required for model inference (Chrome, Edge, Opera)
- **File System Access API**: Required for batch processing (Chrome, Edge, Opera)

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

### Single Image Mode

1. Click "Load model" to download and initialize the Florence-2 model
2. Select a task from the dropdown
3. Upload an image
4. Click "Run model" to process

### Batch Processing Mode

Process multiple images efficiently with streaming results:

1. Click "Batch Processing" tab
2. Load the model if not already loaded
3. Select a task
4. Choose images using either:
   - **Select Files**: Pick multiple image files
   - **Select Folder**: Choose a folder containing images
5. Select output format:
   - **Single JSON File**: All results in one JSON file
   - **CSV File**: Flattened data in CSV format (useful for OD tasks)
   - **Individual JSON Files**: Separate JSON file for each image in a folder
6. Click "Run model"
7. Choose where to save the output (file or folder depending on format)
8. Results are saved automatically as each image is processed (streaming mode)

**Benefits of streaming mode:**
- Memory efficient: results are written to disk immediately
- No risk of data loss: partial results are preserved even if interrupted
- Works with thousands of images without memory issues
- Real-time file writing as processing happens

### Crop Images Mode

After running object detection, you can crop the detected regions:

1. Click "Crop Images" tab
2. Select the CSV file containing detection results (must have columns: image, label, xmin, ymin, xmax, ymax)
3. Select the images to crop from:
   - **Select Files**: Pick the original image files
   - **Select Folder**: Choose folder with original images
4. Click "Crop and Save Images"
5. Choose an output folder where cropped images will be saved
6. Cropped regions are automatically organized into subfolders by label

The cropping tool will:
- Filter detections with confidence score < 0.5
- Clamp bounding boxes to image boundaries
- Create organized folders for each detected class
- Save crops as JPEG files with quality 95%

## Technical Details

This project uses:
- React + Vite for the UI
- 🤗 Transformers.js for model inference
- WebGPU for GPU acceleration
- File System Access API for file operations
- Tailwind CSS for styling

The batch processing implementation is inspired by the Node.js script (`fromnode.js`) but adapted to run entirely in the browser using modern web APIs.

## Model Information

- Model: [onnx-community/Florence-2-base-ft](https://huggingface.co/onnx-community/Florence-2-base-ft)
- Parameters: 230 million
- Size: ~340 MB (cached after first load)
- All processing happens locally in your browser - no server calls needed!
