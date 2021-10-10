import { RuntimeConnection } from '../connections';
import { useEffect, useState } from 'react';

export const useRuntimeConnection = () => {
  const [runtimeConnection, _setRuntimeConnection] = useState(new RuntimeConnection());

  useEffect(() => {
    setInterval(() => runtimeConnection.sendRunMode({ mode: 2 }), 5000);

    return () => {
      runtimeConnection.close();
    }
  }, [runtimeConnection]);

  const connect = (newIp: string) => {
    runtimeConnection.connect(newIp);
  }

  return { connect };
}