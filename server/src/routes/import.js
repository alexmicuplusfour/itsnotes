const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const { processGoogleKeepImport } = require('../import-notes');
const { blockInDemo } = require('../middleware/demoGuard');

// Define temp directory for Docker compatibility
const tempDir = process.env.NODE_ENV === 'production'
  ? '/tmp/itsnotes-import'  // Docker path
  : path.join(os.tmpdir(), 'itsnotes-import'); // Local development path

// Create a temp directory for uploads if it doesn't exist
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

console.log(`Using import temp directory: ${tempDir}`);

// Configure multer for file upload handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Configure multer for large files (10GB limit)
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB
  },
  fileFilter: (req, file, cb) => {
    // Accept only zip files
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

// Helper function to create a directory if it doesn't exist
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

// Helper function to extract the zip file
const execPromise = promisify(exec);
const extractZip = async (zipPath, destPath) => {
  try {
    await execPromise(`unzip -o "${zipPath}" -d "${destPath}"`);
    return true;
  } catch (error) {
    console.error('Error extracting zip:', error);
    return false;
  }
};

// Helper function to find the Keep directory in the extracted Takeout
const findKeepDirectory = (basePath) => {
  // Try common paths for Google Takeout structure
  const commonPaths = [
    path.join(basePath, 'Takeout', 'Keep'),
    path.join(basePath, 'Keep')
  ];
  
  for (const dirPath of commonPaths) {
    if (fs.existsSync(dirPath)) {
      return dirPath;
    }
  }
  
  // If common paths don't work, try to find it recursively
  const findDir = (currentPath, depth = 0) => {
    if (depth > 3) return null; // Limit search depth to avoid excessive recursion
    
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      
      // First check if current directory contains JSON files that look like Keep notes
      const jsonFiles = entries.filter(entry => 
        entry.isFile() && entry.name.endsWith('.json')
      );
      
      if (jsonFiles.length > 0) {
        // Read one JSON file to see if it's likely a Keep note
        try {
          const samplePath = path.join(currentPath, jsonFiles[0].name);
          const content = fs.readFileSync(samplePath, 'utf8');
          const data = JSON.parse(content);
          
          // Check for typical Keep note properties
          if (data.title !== undefined && (data.textContent !== undefined || data.listContent !== undefined)) {
            return currentPath;
          }
        } catch (e) {
          // If we can't parse the JSON or it doesn't match, continue searching
        }
      }
      
      // Look for 'Keep' directory
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (entry.name === 'Keep') {
            return path.join(currentPath, entry.name);
          }
          
          const foundPath = findDir(path.join(currentPath, entry.name), depth + 1);
          if (foundPath) return foundPath;
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentPath}:`, error);
    }
    
    return null;
  };
  
  return findDir(basePath);
};

// Helper function to cleanup temporary files
const cleanup = (filePath, extractPath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    if (extractPath && fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Upload and import route
router.post('/', blockInDemo, upload.single('archive'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const zipFilePath = req.file.path;
  const extractionDir = path.join(tempDir, `extract-${Date.now()}`);
  
  // Set higher timeout for large archives
  req.setTimeout(3600000); // 1 hour timeout for the request
  res.setTimeout(3600000); // 1 hour timeout for the response
  
  try {
    // Create extraction directory
    ensureDir(extractionDir);
    
    // Send an initial response to prevent client timeout
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Helper function to send progress updates to client
    const sendProgress = (event, data) => {
      res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
    };
    
    sendProgress('status', { message: 'Starting import process...' });
    
    // Extract the zip file
    sendProgress('status', { message: `Extracting archive...` });
    console.log(`Extracting ${zipFilePath} to ${extractionDir}...`);
    const extractSuccess = await extractZip(zipFilePath, extractionDir);
    
    if (!extractSuccess) {
      sendProgress('error', { message: 'Failed to extract the ZIP file' });
      cleanup(zipFilePath, extractionDir);
      res.end();
      return;
    }
    
    // Find the Keep directory
    sendProgress('status', { message: 'Searching for Keep notes...' });
    console.log('Searching for Keep directory...');
    const keepDir = findKeepDirectory(extractionDir);
    
    if (!keepDir) {
      sendProgress('error', { 
        message: 'Could not find Google Keep notes in the uploaded archive. Please ensure you uploaded a valid Google Takeout export containing Keep notes.' 
      });
      cleanup(zipFilePath, extractionDir);
      res.end();
      return;
    }
    
    console.log(`Found Keep directory at ${keepDir}`);
    sendProgress('status', { message: 'Found Keep notes, starting import...' });
    
    // Process the import with progress updates
    try {
      // Patch the processGoogleKeepImport function to send progress
      const originalProcessNote = processGoogleKeepImport;
      
      // Create a wrapped version that sends progress updates
      const processWithProgress = async (dirPath) => {
        // Get file count first
        const files = fs.readdirSync(dirPath)
          .filter(file => file.endsWith('.json'));
        
        sendProgress('status', { message: `Found ${files.length} notes to import` });
        
        // Track progress
        let lastProgressPercent = 0;
        
        // Override the console.log function temporarily to capture progress
        const originalConsoleLog = console.log;
        console.log = (message) => {
          originalConsoleLog(message);
          
          // Check if the message contains batch progress
          if (message.includes('Progress:')) {
            const progressMatch = message.match(/Progress: (\d+)\/(\d+)/);
            if (progressMatch) {
              const [, current, total] = progressMatch;
              const percent = Math.floor((parseInt(current) / parseInt(total)) * 100);
              
              // Only send updates when the percentage changes significantly
              if (percent >= lastProgressPercent + 5 || percent === 100) {
                lastProgressPercent = percent;
                sendProgress('progress', { 
                  current: parseInt(current),
                  total: parseInt(total),
                  percent
                });
              }
            }
          }
        };
        
        try {
          const result = await originalProcessNote(dirPath);
          
          // Restore original console.log
          console.log = originalConsoleLog;
          
          return result;
        } catch (error) {
          // Restore original console.log
          console.log = originalConsoleLog;
          throw error;
        }
      };
      
      const importResult = await processWithProgress(keepDir);
      
      // Clean up temporary files
      cleanup(zipFilePath, extractionDir);
      
      // Send final success result
      sendProgress('complete', { 
        success: true,
        message: 'Import completed successfully',
        result: importResult 
      });
      
      res.end();
    } catch (importError) {
      console.error('Import process error:', importError);
      sendProgress('error', { 
        message: 'An error occurred during the import process',
        details: importError.message
      });
      cleanup(zipFilePath, extractionDir);
      res.end();
    }
  } catch (error) {
    console.error('Import setup error:', error);
    cleanup(zipFilePath, extractionDir);
    
    // If headers haven't been sent yet, send a normal error response
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'An error occurred during the import process',
        details: error.message
      });
    } else {
      // If streaming has already started, send error as event
      res.write(`data: ${JSON.stringify({ 
        event: 'error', 
        data: { 
          message: 'An error occurred during the import process',
          details: error.message
        } 
      })}\n\n`);
      res.end();
    }
  }
});

// Get import status route
router.get('/status', (req, res) => {
  res.json({ status: 'available' });
});

// Stream endpoint for Server-Sent Events
router.get('/stream', (req, res) => {
  // Setup SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Send a ping immediately to establish the connection
  res.write(`data: ${JSON.stringify({ event: 'status', data: { message: 'Connected to server stream' } })}\n\n`);
  
  // Keep the connection alive with a ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ event: 'ping', data: { timestamp: Date.now() } })}\n\n`);
  }, 30000);
  
  // Close and cleanup when client disconnects
  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

module.exports = router;