import React, { useState } from 'react';
import axios from 'axios';

const CertificateCheck = ({ onCertAccepted }) => {
  const [isChecking, setIsChecking] = useState(false);
  
  // Use environment variable for server IP
  const SERVER_IP = process.env.REACT_APP_SERVER_IP;
  
  const acceptCertificate = async () => {
    setIsChecking(true);
    
    try {
      // Open an iframe to trigger certificate acceptance
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = `https://${SERVER_IP}:443/videotest`;
      document.body.appendChild(iframe);
      
      // Wait a moment for the certificate prompt to show
      setTimeout(() => {
        // Make a direct test request with certificate validation disabled
        axios.get(`https://${SERVER_IP}:443/api/health-check`, {
          timeout: 5000,
          httpsAgent: { rejectUnauthorized: false }
        })
        .then(() => {
          // Certificate was accepted or bypassed
          sessionStorage.setItem('certAccepted', 'true');
          if (onCertAccepted) onCertAccepted();
        })
        .catch(() => {
          setIsChecking(false);
          alert("Please accept the certificate when prompted by your browser.");
        })
        .finally(() => {
          // Clean up the iframe
          document.body.removeChild(iframe);
        });
      }, 1000);
    } catch (error) {
      setIsChecking(false);
      console.error("Certificate check error:", error);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Security Certificate Setup Required</h2>
        <p style={styles.text}>
          This app uses a secure connection that requires you to accept a security certificate.
        </p>
        <p style={styles.text}>
          When prompted, please click "Advanced" and then "Continue to site" (or similar options)
          to accept the certificate.
        </p>
        
        <button 
          onClick={acceptCertificate} 
          disabled={isChecking}
          style={styles.button}
        >
          {isChecking ? 'Setting up secure connection...' : 'Setup Secure Connection'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%'
  },
  heading: {
    color: '#333',
    marginBottom: '20px',
    fontSize: '24px'
  },
  text: {
    color: '#666',
    marginBottom: '20px',
    fontSize: '16px',
    lineHeight: '1.5'
  },
  button: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    width: '100%'
  }
};

export default CertificateCheck;