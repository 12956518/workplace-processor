import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Change these lines at the top of your App.jsx
const API_BASE_URL = 'https://workplace-processor.onrender.com';
const WS_URL = 'wss://workplace-processor.onrender.com/ws';

export default function App() {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket
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
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const extractPostId = (input) => {
    // Handle full Workplace URLs with permalink format
    if (input.includes('workplace.com')) {
      const matches = input.match(/\/permalink\/(\d+)/);
      return matches ? matches[1] : input;
    }
    // Handle group_id_post_id format
    if (input.includes('_')) {
      return input.split('_').pop();
    }
    // Handle direct post IDs
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

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <h1 className="title">Workplace Post Processor</h1>
          
          <div className="input-group">
            <label>
              Enter Workplace Post ID or Permalink:
            </label>
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
