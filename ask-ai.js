const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Configure OpenAI using the new API format
const openai = new OpenAI({
  apiKey: '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',
});

// Screenshot directories to monitor
const SCREENSHOT_DIRS = [
  '/sdcard/DCIM/Screenshots',
  '/sdcard/Pictures/Screenshots'
];

// Keep track of existing files to avoid processing old screenshots
const existingFiles = new Set();
let isInitialScanComplete = false;

// Function to encode image to base64
function encodeImageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const extension = path.extname(imagePath).toLowerCase();
    
    let mimeType;
    switch (extension) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.png':
        mimeType = 'image/png';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      default:
        throw new Error(`Unsupported image format: ${extension}`);
    }
    
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error('Error encoding image:', error.message);
    return null;
  }
}

// Function to analyze image with AI
async function askAIWithImage(question, imagePath) {
  try {
    const base64Image = encodeImageToBase64(imagePath);
    if (!base64Image) return null;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that can analyze images. Respond in Indonesian language.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: question
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI Vision API:', error.message);
    return null;
  }
}

// Function for text-only chat
async function askAI(message) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant. Respond in Indonesian language unless the user specifically asks to use another language.'
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    return null;
  }
}

// Function to process new screenshot
async function processNewScreenshot(filePath, questionType = 'single', onUpdate = null) {
  try {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toLocaleString('id-ID');
    
    // Send status update
    if (onUpdate) {
      onUpdate('processing', `📸 Memproses screenshot: ${fileName}`);
      onUpdate('processing', '🤖 Menganalisis gambar dengan AI...');
    }
    
    // Determine question based on type
    let question;
    if (questionType === 'multiple') {
      question = "Apa jawaban dari pertanyaan ini? Jika ada beberapa jawaban yang mungkin, berikan semua jawaban yang valid. Pisahkan setiap jawaban dengan jelas.";
    } else {
      question = "Apa jawaban dari pertanyaan ini?";
    }
    
    // Analyze with AI
    const answer = await askAIWithImage(question, filePath);
    
    if (answer) {
      const result = {
        fileName,
        filePath,
        timestamp,
        question: questionType === 'multiple' ? 'Jawaban Multiple' : 'Jawaban Single',
        answer,
        questionType
      };
      
      // Send result update
      if (onUpdate) {
        onUpdate('result', `✅ Analisis selesai untuk ${fileName}`, result);
      }
      
      return result;
    } else {
      if (onUpdate) {
        onUpdate('error', `❌ Gagal menganalisis ${fileName}`);
      }
      return null;
    }
    
  } catch (error) {
    console.error('Error processing screenshot:', error.message);
    if (onUpdate) {
      onUpdate('error', `❌ Error: ${error.message}`);
    }
    return null;
  }
}

// Function to check if file is an image
function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
}

// Function to scan existing files (for initial setup)
function scanExistingFiles() {
  console.log('📁 Scanning existing files...');
  
  for (const dir of SCREENSHOT_DIRS) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (isImageFile(filePath)) {
            existingFiles.add(filePath);
          }
        }
        console.log(`📂 Found ${files.filter(f => isImageFile(path.join(dir, f))).length} existing files in ${dir}`);
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }
  }
  
  console.log(`📊 Total existing files: ${existingFiles.size}`);
}

// Function to start monitoring screenshot directories
function startScreenshotMonitoring(questionType = 'single', onUpdate = null) {
  console.log('🔍 Starting automatic screenshot monitoring...');
  
  // Check which directories exist
  const existingDirs = SCREENSHOT_DIRS.filter(dir => {
    try {
      return fs.existsSync(dir);
    } catch (error) {
      return false;
    }
  });
  
  if (existingDirs.length === 0) {
    console.log('⚠️ No screenshot directories found');
    if (onUpdate) {
      onUpdate('warning', '⚠️ Direktori screenshot tidak ditemukan. Pastikan /sdcard/DCIM/Screenshots atau /sdcard/Pictures/Screenshots ada.');
    }
    return null;
  }
  
  console.log('📁 Monitoring directories:', existingDirs);
  if (onUpdate) {
    onUpdate('info', `📁 Auto-monitoring dimulai: ${existingDirs.join(', ')}`);
  }
  
  // Scan existing files first
  scanExistingFiles();
  
  // Initialize file watcher
  const watcher = chokidar.watch(existingDirs, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Skip initial scan since we handle it manually
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });
  
  // Mark initial scan as complete after a short delay
  setTimeout(() => {
    isInitialScanComplete = true;
    console.log('✅ Initial scan complete. Now monitoring for new files only.');
    if (onUpdate) {
      onUpdate('success', `✅ Monitoring aktif! Ditemukan ${existingFiles.size} file existing. Siap mendeteksi screenshot baru.`);
    }
  }, 3000);
  
  // Handle new files (only process files that weren't in initial scan)
  watcher.on('add', async (filePath) => {
    try {
      if (!isImageFile(filePath)) return;
      
      // Skip if this file was already existing during initial scan
      if (existingFiles.has(filePath)) {
        console.log(`⏭️ Skipping existing file: ${path.basename(filePath)}`);
        return;
      }
      
      // Only process if initial scan is complete
      if (!isInitialScanComplete) {
        console.log(`⏳ Waiting for initial scan to complete: ${path.basename(filePath)}`);
        return;
      }
      
      console.log(`🆕 NEW screenshot detected: ${filePath}`);
      if (onUpdate) {
        onUpdate('info', `🆕 Screenshot baru terdeteksi: ${path.basename(filePath)}`);
      }
      
      // Add to existing files set
      existingFiles.add(filePath);
      
      // Wait a moment to ensure file is fully written
      setTimeout(async () => {
        await processNewScreenshot(filePath, questionType, onUpdate);
      }, 1000);
      
    } catch (error) {
      console.error('Error handling new file:', error.message);
      if (onUpdate) {
        onUpdate('error', `❌ Error processing file: ${error.message}`);
      }
    }
  });
  
  // Handle file changes (in case of overwrites)
  watcher.on('change', async (filePath) => {
    try {
      if (!isImageFile(filePath)) return;
      if (!isInitialScanComplete) return;
      
      console.log(`🔄 File changed: ${filePath}`);
      if (onUpdate) {
        onUpdate('info', `🔄 File berubah: ${path.basename(filePath)}`);
      }
      
      // Wait a moment to ensure file is fully written
      setTimeout(async () => {
        await processNewScreenshot(filePath, questionType, onUpdate);
      }, 1000);
      
    } catch (error) {
      console.error('Error handling file change:', error.message);
    }
  });
  
  // Handle errors
  watcher.on('error', (error) => {
    console.error('File watcher error:', error.message);
    if (onUpdate) {
      onUpdate('error', `❌ File watcher error: ${error.message}`);
    }
  });
  
  return watcher;
}

// Function to stop monitoring
function stopScreenshotMonitoring(watcher) {
  if (watcher) {
    watcher.close();
    console.log('🛑 Screenshot monitoring stopped');
  }
}

// Function to get existing screenshots (for web display)
function getExistingScreenshots() {
  const screenshots = [];
  
  for (const dir of SCREENSHOT_DIRS) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          if (isImageFile(filePath)) {
            const stats = fs.statSync(filePath);
            screenshots.push({
              fileName: file,
              filePath,
              size: stats.size,
              modified: stats.mtime,
              directory: dir
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error.message);
    }
  }
  
  // Sort by modification time (newest first)
  screenshots.sort((a, b) => b.modified - a.modified);
  
  return screenshots;
}

// Export functions for use as a module
module.exports = {
  startScreenshotMonitoring,
  stopScreenshotMonitoring,
  processNewScreenshot,
  getExistingScreenshots,
  askAI,
  askAIWithImage,
  encodeImageToBase64
};

// Example usage (only run if this file is executed directly)
async function main() {
  console.log('🚀 Starting AI Screenshot Monitor...');
  
  // Show existing screenshots
  const existing = getExistingScreenshots();
  console.log(`📸 Found ${existing.length} existing screenshots`);
  
  // Start automatic monitoring
  const watcher = startScreenshotMonitoring('single', (type, message, data) => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (data) {
      console.log('📋 Result:', data.answer);
    }
  });
  
  // Keep the process running
  console.log('✅ Auto-monitoring active. Press Ctrl+C to stop.');
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping monitoring...');
    stopScreenshotMonitoring(watcher);
    process.exit(0);
  });
}

// Only run main() if this file is executed directly (not imported)
if (require.main === module) {
  main();
}