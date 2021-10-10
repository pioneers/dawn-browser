import React, { useEffect } from 'react';
// import {VideoFeed} from './video-feed/VideoFeed';
import { useRuntimeConnection } from './hooks';
import './App.css';

export const App = () => {
  const runtimeConnection = useRuntimeConnection();

  useEffect(() => {
    runtimeConnection.connect('127.0.0.1')
  }, [runtimeConnection]);

  // const ws = new WebSocket('ws://127.0.0.1:5000');

  // ws.addEventListener('close', (ev: Event) => console.log('Connection closed', ev));

  // ws.onopen = ((ev: Event) => {
  //   console.log('web socket open', ev);
  //   ws.send(Buffer.from([1]));
  //   setInterval(() => ws.send('testing'), 1000);
  // });

  // ws.addEventListener('message', (message: MessageEvent<string | Blob>) => {
  //   console.log('received data: %s', message.data.toString());
  // });

  // ws.addEventListener('error', (ev: Event) => console.log('error', ev));

  return (
    <div className="App">
      <p>Dawn is the best software team.</p>
      {/* <VideoFeed webSocket={ws}> */}
    </div>
  );
}

export default App;
