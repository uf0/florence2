import { useEffect, useState, useRef, useCallback } from 'react';

import Progress from './components/Progress';
import ImageInput from './components/ImageInput';
import BatchImageInput from './components/BatchImageInput';
import CroppingTab from './components/CroppingTab';
import { isFileSystemAccessSupported } from './utils/fileSystemAccess';
import { createStreamingWriter } from './utils/streamingWriter';

const IS_WEBGPU_AVAILABLE = !!navigator.gpu;
const IS_FILE_SYSTEM_ACCESS_AVAILABLE = isFileSystemAccessSupported();

function App() {

  // Create a reference to the worker object.
  const worker = useRef(null);

  // Model loading and progress
  const [status, setStatus] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [progressItems, setProgressItems] = useState([]);

  const [task, setTask] = useState('<OD>');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [time, setTime] = useState(null);

  // Tab mode: 'batch' or 'crop'
  const [activeTab, setActiveTab] = useState('batch');

  // Batch processing states
  const [batchMode, setBatchMode] = useState(true);
  const [batchImages, setBatchImages] = useState([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, filename: '' });
  const [outputFormat, setOutputFormat] = useState('csv');
  const [processingStats, setProcessingStats] = useState(null);
  
  // Streaming writer reference
  const streamingWriter = useRef(null);

  // We use the `useEffect` hook to setup the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(new URL('./worker.js', import.meta.url), {
        type: 'module'
      });
    }

    // Create a callback function for messages from the worker thread.
    const onMessageReceived = (e) => {
      switch (e.data.status) {
        case 'loading':
          // Model file start load: add a new progress item to the list.
          setStatus('loading');
          setLoadingMessage(e.data.data);
          break;

        case 'initiate':
          setProgressItems(prev => [...prev, e.data]);
          break;

        case 'progress':
          // Model file progress: update one of the progress items.
          setProgressItems(
            prev => prev.map(item => {
              if (item.file === e.data.file) {
                return { ...item, ...e.data }
              }
              return item;
            })
          );
          break;

        case 'done':
          // Model file loaded: remove the progress item from the list.
          setProgressItems(
            prev => prev.filter(item => item.file !== e.data.file)
          );
          break;

        case 'ready':
          // Pipeline ready: the worker is ready to accept messages.
          setStatus('ready');
          break;

        case 'complete':
          setResult(e.data.result);
          setTime(e.data.time);
          setStatus('ready');
          break;

        case 'batch-progress':
          setBatchProgress({
            current: e.data.current,
            total: e.data.total,
            filename: e.data.filename
          });
          break;

        case 'batch-result':
          // Write single result to streaming writer
          if (streamingWriter.current) {
            streamingWriter.current.writeResult({
              filename: e.data.filename,
              result: e.data.result,
              rawResult: e.data.rawResult,
              time: e.data.time,
              error: e.data.error
            }).catch(err => {
              console.error('Error writing result:', err);
            });
          }
          break;

        case 'batch-complete':
          // Finalize streaming writer
          if (streamingWriter.current) {
            streamingWriter.current.finalize().then(() => {
              streamingWriter.current = null;
              setProcessingStats({
                total: e.data.total,
                totalTime: e.data.totalTime
              });
              setStatus('ready');
            }).catch(err => {
              console.error('Error finalizing writer:', err);
              setStatus('ready');
            });
          } else {
            setStatus('ready');
          }
          break;
      }
    };

    // Attach the callback function as an event listener.
    worker.current.addEventListener('message', onMessageReceived);

    // Define a cleanup function for when the component is unmounted.
    return () => {
      worker.current.removeEventListener('message', onMessageReceived);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (status === null) {
      setStatus('loading');
      worker.current.postMessage({ type: 'load' });
    } else if (batchMode && batchImages.length > 0) {
      // Initialize streaming writer before processing
      try {
        streamingWriter.current = await createStreamingWriter(outputFormat, task);
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('User cancelled file/folder selection');
          return;
        }
        alert('Error setting up output file: ' + err.message);
        return;
      }

      // Batch processing
      setStatus('running');
      setProcessingStats(null);
      setBatchProgress({ current: 0, total: batchImages.length, filename: '' });
      
      const imageDataArray = batchImages.map(file => ({
        name: file.name,
        url: URL.createObjectURL(file)
      }));

      worker.current.postMessage({
        type: 'run-batch',
        data: { images: imageDataArray, task, text }
      });
    } else if (!batchMode && image) {
      // Single image processing
      setStatus('running');
      worker.current.postMessage({
        type: 'run', data: { text, url: image, task }
      });
    }
  }, [status, task, image, text, batchMode, batchImages, outputFormat]);

  const handleBatchImagesSelected = useCallback((files) => {
    setBatchImages(files);
    setProcessingStats(null);
    worker.current.postMessage({ type: 'reset' });
  }, []);

  return (
    IS_WEBGPU_AVAILABLE
      ? (<div className="flex flex-col h-screen mx-auto items justify-end text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 max-w-[630px]">

        {status === 'loading' && (
          <div className="flex justify-center items-center fixed w-screen h-screen bg-black z-10 bg-opacity-[92%] top-0 left-0">
            <div className="w-[500px]">
              <p className="text-center mb-1 text-white text-md">{loadingMessage}</p>
              {progressItems.map(({ file, progress, total }, i) => (
                <Progress key={i} text={file} percentage={progress} total={total} />
              ))}
            </div>
          </div>
        )}
        <div className="h-full overflow-auto scrollbar-thin flex justify-center items-center flex-col relative">
          <div className="flex flex-col items-center mb-1 text-center">
            <h1 className="text-6xl font-bold mb-2">Florence2 WebGPU</h1>
            <h2 className="text-xl font-semibold">Powerful vision foundation model running locally in your browser.</h2>
          </div>

          <div className="w-full min-h-[220px] flex flex-col justify-center items-center p-2">

            <p className="mb-2">
              You are about to download <a href="https://huggingface.co/onnx-community/Florence-2-base-ft" target="_blank" rel="noreferrer" className="font-medium underline">Florence-2-base-ft</a>,
              a 230 million parameter vision foundation model that uses a prompt-based approach to handle a wide range of vision and vision-language tasks like captioning, object detection, and segmentation.
              Once loaded, the model (340&nbsp;MB) will be cached and reused when you revisit the page.<br />
              <br />
              Everything runs locally in your browser using <a href="https://huggingface.co/docs/transformers.js" target="_blank" rel="noreferrer" className="underline">🤗&nbsp;Transformers.js</a> and ONNX Runtime Web,
              meaning no API calls are made to a server for inference. You can even disconnect from the internet after the model has loaded!
            </p>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                className={`px-4 py-2 rounded-md ${activeTab === 'batch' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                onClick={() => {
                  setActiveTab('batch');
                  setBatchMode(true);
                  setResult(null);
                  setImage(null);
                }}
                disabled={status === 'running' || !IS_FILE_SYSTEM_ACCESS_AVAILABLE}
              >
                Batch Processing
              </button>
              <button
                className={`px-4 py-2 rounded-md ${activeTab === 'crop' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                onClick={() => {
                  setActiveTab('crop');
                }}
                disabled={!IS_FILE_SYSTEM_ACCESS_AVAILABLE}
              >
                Crop Images
              </button>
            </div>

            {!IS_FILE_SYSTEM_ACCESS_AVAILABLE && (
              <p className="text-sm text-orange-600 mb-2">
                Note: These features require File System Access API support (Chrome, Edge, or Opera).
              </p>
            )}

            {activeTab === 'crop' ? (
              <CroppingTab />
            ) : (
              <div className="flex w-full justify-around m-4">
              {!batchMode ? (
                // Single image mode UI
                <>
                  <div className="flex flex-col gap-2 w-full max-w-[48%]">
                    <div className="flex flex-col">
                      <span className="text-sm mb-0.5">Task</span>
                      <select
                        className="border rounded-md p-1"
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                      >
                        <option value="<OD>">Object Detection</option>
                        <option value="<OCR_WITH_REGION>">OCR with Region</option>
                        <option value="<CAPTION>">Caption</option>
                        <option value="<DETAILED_CAPTION>">Detailed Caption</option>
                        <option value="<MORE_DETAILED_CAPTION>">More Detailed Caption</option>
                        {/* <option value="<OCR>">OCR</option> */}
                        <option value="<DENSE_REGION_CAPTION>">Dense Region Caption</option>
                        {/* <option value="<CAPTION_TO_PHRASE_GROUNDING>">Caption to Phrase Grounding</option> */}
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm mb-0.5">Input Image</span>
                      <ImageInput className="flex flex-col items-center border border-gray-300 rounded-md cursor-pointer h-[250px]" onImageChange={(file, result) => {
                        worker.current.postMessage({ type: 'reset' }); // Reset image cache
                        setResult(null);
                        setImage(result);
                      }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-[48%] justify-end">
                    {
                      task === '<CAPTION_TO_PHRASE_GROUNDING>'
                      && (<div className="flex flex-col">
                        <span className="text-sm mb-0.5">Text input</span>
                        <input className="border rounded-md px-2 py-[3.5px]"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                        />
                      </div>)
                    }

                    <div className="flex flex-col relative">
                      <span className="text-sm mb-0.5">Output</span>
                      <div className="flex justify-center border border-gray-300 rounded-md h-[250px]">
                        {result?.[task] && (<>
                          {
                            typeof result[task] === 'string'
                              ? <p className="pt-4 px-4 text-center max-h-[205px] overflow-y-auto">{result[task]}</p>
                              : <pre className="w-full h-full p-2 overflow-y-auto">
                                {JSON.stringify(result[task], null, 2)}
                              </pre>
                          }
                          {
                            time && <p className="text-sm text-gray-500 absolute bottom-2 bg-white p-1 rounded border">Execution time: {time.toFixed(2)} ms</p>
                          }
                        </>)
                        }
                      </div>

                    </div>
                  </div>
                </>
              ) : (
                // Batch mode UI
                <div className="flex flex-col gap-4 w-full">
                  <div className="flex gap-4">
                    <div className="flex flex-col gap-2 w-1/2">
                      <div className="flex flex-col">
                        <span className="text-sm mb-0.5">Task</span>
                        <select
                          className="border rounded-md p-1"
                          value={task}
                          onChange={(e) => setTask(e.target.value)}
                          disabled={status === 'running'}
                        >
                          <option value="<OD>">Object Detection</option>
                          <option value="<CAPTION>">Caption</option>
                          <option value="<DETAILED_CAPTION>">Detailed Caption</option>
                          <option value="<MORE_DETAILED_CAPTION>">More Detailed Caption</option>
                          <option value="<DENSE_REGION_CAPTION>">Dense Region Caption</option>
                          <option value="<OCR>">OCR</option>
                          <option value="<OCR_WITH_REGION>">OCR with Region</option>
                          
                          
                          {/* <option value="<CAPTION_TO_PHRASE_GROUNDING>">Caption to Phrase Grounding</option> */}
                        </select>
                      </div>

                      {task === '<CAPTION_TO_PHRASE_GROUNDING>' && (
                        <div className="flex flex-col">
                          <span className="text-sm mb-0.5">Text input</span>
                          <input 
                            className="border rounded-md px-2 py-[3.5px]"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={status === 'running'}
                          />
                        </div>
                      )}

                      <BatchImageInput 
                        onImagesSelected={handleBatchImagesSelected}
                        disabled={status === 'running'}
                      />

                      <div className="flex flex-col">
                        <span className="text-sm mb-0.5">Output Format</span>
                        <select
                          className="border rounded-md p-1"
                          value={outputFormat}
                          onChange={(e) => setOutputFormat(e.target.value)}
                          disabled={status === 'running'}
                        >
                          <option value="csv">CSV File</option>
                          <option value="json">Single JSON File</option>
                          <option value="individual">Individual JSON Files</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          You'll select the output location before processing starts
                        </p>
                      </div>

                      {status === 'running' && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-md">
                          <p className="text-sm font-medium">
                            Processing: {batchProgress.current} / {batchProgress.total}
                          </p>
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            Current: {batchProgress.filename}
                          </p>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all" 
                              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            Results are being saved as you process...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 w-1/2">
                      <span className="text-sm mb-0.5">Status</span>
                      <div className="border border-gray-300 rounded-md p-3 h-[300px] flex flex-col justify-center items-center">
                        {processingStats ? (
                          <div className="text-center">
                            <div className="mb-4">
                              <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <p className="text-lg font-semibold mb-2">Processing Complete!</p>
                            <p className="text-sm text-gray-600">
                              Processed {processingStats.total} images
                            </p>
                            <p className="text-sm text-gray-600">
                              Total time: {(processingStats.totalTime / 1000).toFixed(2)}s
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              Results have been saved to your selected location
                            </p>
                          </div>
                        ) : status === 'running' ? (
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p className="text-sm text-gray-600">Processing and saving results...</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Ready to process. Select images, choose output format, and click "Run model".</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            {activeTab === 'batch' && (
              <button
                className="border px-4 py-2 rounded-lg bg-blue-400 text-white hover:bg-blue-500 disabled:bg-blue-100 disabled:cursor-not-allowed select-none"
                onClick={handleClick}
                disabled={
                  status === 'running' || 
                  (status !== null && !batchMode && image === null) ||
                  (status !== null && batchMode && batchImages.length === 0)
                }
              >
                {status === null ? 'Load model' :
                  status === 'running'
                    ? batchMode ? `Processing ${batchProgress.current}/${batchProgress.total}...` : 'Running...'
                    : 'Run model'
                }
              </button>
            )}
          </div>
        </div>

      </div >)
      : (<div className="fixed w-screen h-screen bg-black z-10 bg-opacity-[92%] text-white text-2xl font-semibold flex justify-center items-center text-center">WebGPU is not supported<br />by this browser :&#40;</div>)
  )
}

export default App
