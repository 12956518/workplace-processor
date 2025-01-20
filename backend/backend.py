from fastapi import FastAPI, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import uvicorn
import json
import hmac
import hashlib
import httpx
import re
from typing import List, Dict, Any
from collections import deque
import os

# Initialize FastAPI app
app = FastAPI(title="Workplace Post Processor API")

# Keep a history of recent webhooks
webhook_history = deque(maxlen=10)
# Store active WebSocket connections
active_connections: List[WebSocket] = []

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration - Use environment variables for sensitive data
VERIFY_TOKEN = os.environ.get('WORKPLACE_VERIFY_TOKEN', 'my_test_token_123')
APP_SECRET = os.environ.get('WORKPLACE_APP_SECRET', '5285ce95e976c196236079f01b99a446')
WORKPLACE_ACCESS_TOKEN = os.environ.get('WORKPLACE_ACCESS_TOKEN', 'DQWRLN3FEV3RtRU5ZAMWJ2QzRzdDhzRlY0N2EyZAHZAnemNhdXYybnVUT1lmMWtUcTZAhdkdROEMwZAklpcXBBTEVEU2plRklDR2pqZA3ltM3IzUVVxNmpENFJlZAERBUjI0dlp3cEVjQkdaeC1xMl9YRDdlbnpTM1VrYUduejlMeDVXakxyU1dlWlBlUENvWXNhclVabU1zOGg3OEM0VkhMN2IwbkczaUx2U21GT2QyTHJvXzR0QUkyMlFuZAWdQODlPM3pGR01qd2Y4Vl92MEZABOFJrUE5nNAZDZD')
AIRTABLE_WEBHOOK = os.environ.get('AIRTABLE_WEBHOOK', 'https://hooks.airtable.com/workflows/v1/genericWebhook/app7kliNTFQP7pa1K/wflXBEgbGhrtUhwTR/wtrB3LOq85sVgMSm0')

WORKPLACE_GRAPH_API = "https://graph.workplace.com"

def clean_message_content(message: str) -> str:
    """Clean up message content by extracting original URLs and removing Workplace formatting"""
    if not message:
        return message
    
    parts = message.split("Link:")
    main_content = parts[0]
    
    real_urls = re.findall(r'https://(?:www\.)?[^/\s]+/[^\s\)\]]+', message)
    original_url = None
    if real_urls:
        original_url = real_urls[0]
        lines = [line.strip() for line in main_content.split('\n') if line.strip()]
        if original_url:
            lines.append(f"Link: {original_url}")
        return '\n'.join(lines)
    
    return message

async def get_post_details(post_id: str) -> Dict:
    """Get full post details from Workplace Graph API"""
    fields = [
        "id", "created_time", "description", "feed_targeting", "from", 
        "icon", "is_hidden", "link", "message", "message_tags", 
        "name", "object_id", "parent_id", "permalink_url", "picture", 
        "place", "properties", "shares", "source"
    ]
    
    url = f"{WORKPLACE_GRAPH_API}/{post_id}"
    params = {
        "fields": ",".join(fields),
        "access_token": WORKPLACE_ACCESS_TOKEN
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        print(f"\n=== Workplace Graph API Response ===")
        print(f"Status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        if response.status_code == 200:
            post_data = response.json()
            if 'message' in post_data:
                post_data['message'] = clean_message_content(post_data['message'])
            return post_data
        else:
            print(f"Error getting post details: {response.text}")
            return None

async def send_to_airtable_webhook(post_data: Dict) -> bool:
    """Forward post data to Airtable webhook"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            AIRTABLE_WEBHOOK,
            json=post_data
        )
        print("\n=== Airtable Webhook Response ===")
        print(f"Status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        return response.status_code == 200

async def notify_clients(data: dict):
    """Notify all connected clients of new webhook data"""
    if active_connections:  # Only proceed if there are active connections
        message = json.dumps(data)
        for connection in active_connections:
            try:
                await connection.send_text(message)
            except:
                active_connections.remove(connection)

@app.get("/")
async def root():
    """Root endpoint for API documentation"""
    return {
        "message": "Workplace Post Processor API",
        "endpoints": {
            "process_post": "/process-post/{post_id}",
            "webhook": "/webhook",
            "websocket": "/ws",
            "verify_webhook": "/verify-webhook"
        },
        "docs": "/docs"
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time webhook monitoring"""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        # Send webhook history when client connects
        for webhook in webhook_history:
            await websocket.send_text(json.dumps(webhook))
        
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        active_connections.remove(websocket)

@app.get("/process-post/{post_id}")
async def process_post(post_id: str):
    """Process a single post by ID"""
    post_details = await get_post_details(post_id)
    
    if post_details:
        success = await send_to_airtable_webhook(post_details)
        if success:
            return {
                "status": "success",
                "message": "Successfully processed post",
                "data": post_details
            }
        else:
            return {
                "status": "error",
                "message": "Failed to forward to Airtable webhook"
            }
    
    return {
        "status": "error",
        "message": "Failed to get post details from Workplace"
    }

@app.post("/verify-webhook")
async def verify_webhook(request: Request):
    """Verify the webhook token"""
    try:
        data = await request.json()
        token = data.get('verify_token')

        if token == VERIFY_TOKEN:
            return JSONResponse({
                'verified': True,
                'message': 'Webhook verification successful'
            })
        else:
            return JSONResponse({
                'verified': False,
                'message': 'Invalid verification token'
            }, status_code=400)
    except Exception as e:
        return JSONResponse({
            'verified': False,
            'message': f'Error during verification: {str(e)}'
        }, status_code=500)

@app.post("/webhook")
async def webhook_handler(request: Request):
    """Handle incoming webhooks from Workplace"""
    body = await request.body()
    headers = dict(request.headers)
    
    received_signature = headers.get('x-hub-signature-256', '')
    expected_signature = 'sha256=' + hmac.new(
        APP_SECRET.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(received_signature, expected_signature):
        print("⚠️ Signature mismatch!")
        return Response(status_code=403)
    
    try:
        workplace_data = json.loads(body)
        print("\n=== Webhook Received ===")
        print(json.dumps(workplace_data, indent=2))
        
        # Store webhook in history with timestamp
        webhook_entry = {
            "timestamp": datetime.now().isoformat(),
            "data": workplace_data
        }
        webhook_history.append(webhook_entry)
        
        # Notify connected clients
        await notify_clients(webhook_entry)
        
        # Process webhook data
        changes = workplace_data.get('entry', [{}])[0].get('changes', [{}])[0]
        post_data = changes.get('value', {})
        verb = post_data.get('verb')
        
        if verb == 'delete':
            print(f"Skipping webhook - Delete event received for post {post_data.get('post_id')}")
            return Response(status_code=200)
        
        post_id = post_data.get('post_id', '').split('_')[-1]
        
        if not post_id:
            print("⚠️ No post ID found in webhook data")
            return Response(status_code=400)
        
        post_details = await get_post_details(post_id)
        
        if post_details:
            success = await send_to_airtable_webhook(post_details)
            if success:
                print("✅ Successfully forwarded post to Airtable")
            else:
                print("❌ Failed to forward to Airtable webhook")
        else:
            print("❌ Failed to get post details from Workplace")

    except Exception as e:
        print(f"Error processing webhook: {str(e)}")
        return {"status": "error", "message": str(e)}

    return {"status": "received"}

if __name__ == "__main__":
    print("\n=== Server Configuration ===")
    print("Server running at: http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
