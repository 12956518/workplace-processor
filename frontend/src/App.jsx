import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Change these based on your actual backend URL
const API_BASE_URL = 'https://workplace-processor.onrender.com';
const WS_URL = 'wss://workplace-processor.onrender.com/ws';

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [verificationToken, setVerificationToken] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    // WebSocket connection logic (unchanged from previous implementation)
    const connectWebSocket = () => {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket Connected');
      };

      ws.onmessage = (event) => {
        const webhookData = JSON.parse(event.data);
        setWebhooks(prev => [webhookData, ...prev].slice(0, 10));
      };

      ws.onclose = () => {
        console.log('WebSocket Disconnected');
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Existing methods from previous implementation
  const extractPostId = (input) => {
    if (input.includes('workplace.com')) {
      const matches = input.match(/\/permalink\/(\d+)/);
      return matches ? matches[1] : input;
    }
    if (input.includes('_')) {
      return input.split('_').pop();
    }
    return input;
  };

  const processPost = async () => {
    setLoading(true);
    setStatus(null);
    setResult(null);

    try {
      const postId = extractPostId(input);
      const response = await fetch(`${API_BASE_URL}/process-post/${postId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to process post');
      }

      if (data.status === 'success') {
        setResult(data.data);
        setStatus({
          type: 'success',
          message: 'Post processed and sent to Airtable successfully!'
        });
      } else {
        throw new Error(data.message || 'Failed to process post');
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message || 'An error occurred while processing the post'
      });
    } finally {
      setLoading(false);
    }
  };

  // New webhook verification method
  const verifyWebhook = async () => {
    if (!verificationToken) {
      setStatus({
        type: 'error',
        message: 'Please enter a verification token'
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/verify-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verify_token: verificationToken })
      });

      const data = await response.json();
      
      if (response.ok && data.verified) {
        setStatus({
          type: 'success',
          message: 'Webhook verification successful!'
        });
      } else {
        setStatus({
          type: 'error',
          message: data.message || 'Webhook verification failed.'
        });
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: 'Error during webhook verification.'
      });
    }
  };

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <h1 className="title">Workplace Post Processor</h1>
          
          <div className="input-group">
            <label>Enter Workplace Post ID or Permalink:</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter post ID or full permalink..."
            />
            <p className="helper-text">
              Accepts: Full permalink, post ID, or group_id_post_id format
            </p>
          </div>

          <button
            onClick={processPost}
            disabled={!input || loading}
            className={`process-button ${loading || !input ? 'disabled' : ''}`}
          >
            {loading ? 'Processing...' : 'Process Post'}
          </button>

          {status && (
            <div className={`status-message ${status.type}`}>
              {status.message}
            </div>
          )}

          {result && (
            <div className="result-container">
              <h3 className="result-title">Post Details:</h3>
              <div className="json-viewer">
                <pre>
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="card webhook-verification-card">
          <h2 className="title">Webhook Verification</h2>
          <div className="input-group">
            <label>Verification Token:</label>
            <input
              type="text"
              value={verificationToken}
              onChange={(e) => setVerificationToken(e.target.value)}
              placeholder="Enter Workplace webhook verification token"
            />
            <button 
              onClick={verifyWebhook}
              disabled={!verificationToken}
              className={`verify-button ${!verificationToken ? 'disabled' : ''}`}
            >
              Verify Webhook
            </button>
          </div>
        </div>

        <div className="card webhook-card">
          <h2 className="title">Webhook Monitor</h2>
          <div className="webhook-list">
            {webhooks.length === 0 ? (
              <p className="no-webhooks">No webhooks received yet...</p>
            ) : (
              webhooks.map((webhook, index) => (
                <div key={index} className="webhook-item">
                  <div className="webhook-header">
                    <span className="webhook-timestamp">
                      {formatDate(webhook.timestamp)}
                    </span>
                  </div>
                  <div className="json-viewer webhook-data">
                    <pre>
                      {JSON.stringify(webhook.data, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
