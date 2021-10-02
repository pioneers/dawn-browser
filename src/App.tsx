import React from 'react';
import logo from './logo.svg';
import { io } from "socket.io-client";
// import {VideoFeed} from './video-feed/VideoFeed';
import './App.css';

export const App = () => {
  const ws = new WebSocket('wss://127.0.0.1:8080');
  const socket = io('wss://127.0.0.1:8080'); //'http://localhost:8080');
  socket.on('connect', () => console.log('socket connected'));
  // console.log('ready state', ws.readyState);

  ws.addEventListener('close', (ev: Event) => console.log('Connection closed', ev));

  ws.addEventListener('open', (ev: Event) => console.log('web socket open', ev));

  ws.addEventListener('message', (message: MessageEvent<string>) => {
    console.log('received data: %s', message.data);
  });

  ws.addEventListener('error', (ev: Event) => console.log('error', ev));

  return (
    <div className="App">
      <p>Dawn is the best software team.</p>
      {/* <VideoFeed webSocket={ws}> */}
    </div>
  );
}

export default App;
