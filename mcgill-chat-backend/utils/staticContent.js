/**
 * Static HTML content for the application
 */

// Default server info page when React build is not found
function getDefaultServerPage() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>McGill Chat Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #7A003C; }
          .info { background: #f4f4f4; padding: 20px; border-radius: 5px; }
          .success { color: green; }
          .error { color: red; }
          .warning { color: orange; }
          code { background: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        </style>
      </head>
      <body>
        <h1>McGill Chat Server</h1>
        <div class="info">
          <p>The server is running correctly! ✅</p>
          <p class="warning">React build not found. Please follow these steps:</p>
          <ol>
            <li>Go to your React project directory: <code>cd ../mcgill-chat-frontend</code></li>
            <li>Build the React app: <code>npm run build</code></li>
            <li>Restart this server</li>
          </ol>
          <p>API Endpoints:</p>
          <ul>
            <li>POST /api/register - Register a new user</li>
            <li>POST /api/login - Log in user</li>
            <li>GET /api/authtest - Test authentication (requires token)</li>
          </ul>
          <p><a href="/videotest">Test WebRTC Camera Access</a></p>
        </div>
      </body>
      </html>
    `;
  }
  
  // WebRTC test page
  function getWebRTCTestPage() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>WebRTC Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          video { width: 100%; border: 1px solid #ddd; border-radius: 8px; background: #000; }
          button { margin-top: 20px; padding: 10px; background: #4CAF50; color: white; border: none; 
                  border-radius: 4px; font-size: 16px; cursor: pointer; }
          .result { margin-top: 20px; padding: 10px; border-radius: 4px; }
          .success { background: rgba(76, 175, 80, 0.2); color: #4CAF50; }
          .error { background: rgba(244, 67, 54, 0.2); color: #F44336; }
        </style>
      </head>
      <body>
        <h2>WebRTC Camera Test</h2>
        <p>This page tests if your device supports WebRTC camera access.</p>
        
        <video id="localVideo" autoplay playsinline muted></video>
        <button id="startButton">Start Camera</button>
        <div id="result" style="display: none;" class="result"></div>
        
        <script>
          document.getElementById('startButton').addEventListener('click', async () => {
            const resultEl = document.getElementById('result');
            resultEl.style.display = 'block';
            
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
              });
              
              const videoElement = document.getElementById('localVideo');
              videoElement.srcObject = stream;
              
              document.getElementById('startButton').textContent = 'Camera Working!';
              document.getElementById('startButton').style.backgroundColor = '#4CAF50';
              
              resultEl.innerHTML = 'SUCCESS: WebRTC is working on your device! The camera access was granted.';
              resultEl.className = 'result success';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            } catch (err) {
              console.error('Error accessing camera:', err);
              document.getElementById('startButton').textContent = 'Error';
              document.getElementById('startButton').style.backgroundColor = '#f44336';
              
              resultEl.innerHTML = 'ERROR: ' + err.message;
              resultEl.className = 'result error';
              
              // Add browser details
              const browserDetails = document.createElement('p');
              browserDetails.textContent = 'Browser: ' + navigator.userAgent;
              resultEl.appendChild(browserDetails);
              
              // Add protocol info
              const protocolDetails = document.createElement('p');
              protocolDetails.textContent = 'Protocol: ' + window.location.protocol;
              resultEl.appendChild(protocolDetails);
            }
          });
        </script>
      </body>
      </html>
    `;
  }
  
  module.exports = {
    getDefaultServerPage,
    getWebRTCTestPage
  };