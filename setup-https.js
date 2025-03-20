// setup-https.js - Improved HTTPS certificate handling

const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const os = require('os');

/**
 * Generate self-signed certificates for development
 * @returns {Object} Certificate object with key and cert
 */
function generateCertificates() {
  console.log('Generating self-signed SSL certificate for development...');
  
  // Get all local IP addresses for certificate
  const networkInterfaces = os.networkInterfaces();
  const localIPs = [];
  
  // Collect all non-internal IPv4 addresses
  Object.keys(networkInterfaces).forEach(interfaceName => {
    const interfaces = networkInterfaces[interfaceName];
    interfaces.forEach(iface => {
      // Skip internal and non-IPv4 addresses
      if (!iface.internal && iface.family === 'IPv4') {
        localIPs.push(iface.address);
      }
    });
  });
  
  // Generate certificate with all hostnames in SAN
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const sans = ['localhost', '127.0.0.1', ...localIPs].map(ip => ({
    type: ip.includes('.') ? 2 : 7, // 2 for IP, 7 for DNS
    value: ip
  }));
  
  // Generate with more secure parameters
  return selfsigned.generate(attrs, { 
    keySize: 2048, 
    days: 365,
    algorithm: 'sha256',
    extensions: [{ 
      name: 'subjectAltName', 
      altNames: sans 
    }]
  });
}

/**
 * Get HTTPS configuration
 * @returns {Object|null} HTTPS configuration or null if unavailable
 */
const getHttpsConfig = () => {
  const certDir = path.join(__dirname, 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  
  try {
    // Check if certificates exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      console.log('Using existing certificates from certs directory');
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
    
    // Generate new certificates if they don't exist
    console.log('No certificates found, generating new ones');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }
    
    const pems = generateCertificates();
    
    // Save certificates for future use
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    
    console.log(`Certificates generated and saved to ${certDir}`);
    
    // Print local IPs for convenience
    const networkInterfaces = os.networkInterfaces();
    const localIPs = [];
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      const interfaces = networkInterfaces[interfaceName];
      interfaces.forEach(iface => {
        if (!iface.internal && iface.family === 'IPv4') {
          localIPs.push(iface.address);
        }
      });
    });
    
    console.log('\nCertificate generated for:');
    console.log('- localhost');
    console.log('- 127.0.0.1');
    localIPs.forEach(ip => console.log(`- ${ip}`));
    
    return {
      key: pems.private,
      cert: pems.cert
    };
  } catch (error) {
    console.error('Failed to set up HTTPS certificates:', error);
    
    // Try to generate in-memory certificates as fallback
    try {
      console.log('Attempting to generate in-memory certificates as fallback');
      const pems = generateCertificates();
      return {
        key: pems.private,
        cert: pems.cert
      };
    } catch (fallbackError) {
      console.error('Failed to generate in-memory certificates:', fallbackError);
      console.log('Running without HTTPS. WebRTC will not work properly in production!');
      return null;
    }
  }
};

module.exports = { getHttpsConfig };