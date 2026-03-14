// vulnerable-example.ts
import { Client } from 'pg';

async function getUser(userId: string) {
  const client = new Client();
  // 🚩 VULNERABILITY: SQL Injection
  // AI should notice: Direct string concatenation in query
  const query = `SELECT * FROM users WHERE id = '${userId}'`; 
  
  // 🚩 VULNERABILITY: Hardcoded Secret
  // AI should notice: Sensitive API Key in source code
  const apiKey = "AIzaSyB-DANGER-KEY-12345"; 

  return client.query(query);
}