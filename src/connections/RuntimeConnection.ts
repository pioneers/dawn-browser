import { Logger } from '../utils';
import * as protos from '../main-protos/protos';
import { Buffer } from 'buffer';

/**
 * Define port constants, which must match with Runtime
 */
const DEFAULT_CONNECTION_PORT = 5000;

/**
 * Runtime IP Address used for TCP and UDP connections
 */
const DEFAULT_CONNECTION_IP = '192.168.0.0';

/**
 * Define message ID constants, which must match with Runtime
 */
enum MsgType {
  RUN_MODE = 0,
  START_POS = 1,
  LOG = 2,
  DEVICE_DATA = 3,
  // 4 reserved for some Shepherd msg type
  INPUTS = 5,
  TIME_STAMPS = 6
}

interface Packet {
  type: MsgType;
  length: number;
  payload: Buffer;
}

/** Given a data buffer, read as many TCP Packets as possible.
 *  If there are leftover bytes, return them so that they can be used in the next cycle of data.
 */
function readPackets(data: Buffer, previousLeftoverBytes?: Buffer): { leftoverBytes?: Buffer; processedTCPPackets: Packet[] } {
  const HEADER_NUM_BYTES = 3;

  const bytesToRead = Buffer.concat([previousLeftoverBytes ?? new Uint8Array(), data]);
  const processedTCPPackets: Packet[] = [];

  let leftoverBytes;
  let currentPos = 0;

  while (currentPos < bytesToRead.length) {
    let header: Buffer;
    let msgType: number;
    let msgLength: number;
    let payload: Buffer;

    if (currentPos + HEADER_NUM_BYTES <= bytesToRead.length) {
      // Have enough bytes to read in 3 byte header
      header = bytesToRead.slice(currentPos, currentPos + HEADER_NUM_BYTES);
      msgType = header[0];
      msgLength = (header[2] << 8) | header[1];
    } else {
      // Don't have enough bytes to read 3 byte header so we save the bytes for the next data cycle
      leftoverBytes = bytesToRead.slice(currentPos);

      return {
        leftoverBytes,
        processedTCPPackets
      };
    }

    currentPos += HEADER_NUM_BYTES;

    if (currentPos + msgLength <= bytesToRead.length) {
      // Have enough bytes to read entire payload from 1 TCP packet
      payload = bytesToRead.slice(currentPos, currentPos + msgLength);
    } else {
      // Don't have enough bytes to read entire payload
      leftoverBytes = bytesToRead.slice(currentPos);

      return {
        // Note: Need to save header so we know how many bytes to read for this packet in the next data cycle
        leftoverBytes: Buffer.concat([header, leftoverBytes]),
        processedTCPPackets
      };
    }

    const newTCPPacket = { type: msgType, length: msgLength, payload };
    processedTCPPackets.push(newTCPPacket);

    currentPos += msgLength;
  }

  return {
    leftoverBytes,
    processedTCPPackets
  };
}

/**
 * Create TCP packet header and prepend to
 * payload to send to Runtime.
 */
function createPacket(payload: unknown, messageType: MsgType): Buffer {
  let encodedPayload: Uint8Array;

  switch (messageType) {
    case MsgType.DEVICE_DATA:
      encodedPayload = protos.DevData.encode(protos.DevData.create(payload as protos.IDevData)).finish();
      break;
    case MsgType.RUN_MODE:
      encodedPayload = protos.RunMode.encode(protos.RunMode.create(payload as protos.IRunMode)).finish();
      break;
    case MsgType.START_POS:
      encodedPayload = protos.StartPos.encode(protos.StartPos.create(payload as protos.IStartPos)).finish();
      break;
    case MsgType.TIME_STAMPS:
      encodedPayload = protos.TimeStamps.encode(protos.TimeStamps.create(payload as protos.ITimeStamps)).finish();
      break;
    case MsgType.INPUTS:
      encodedPayload = protos.UserInputs.encode(
        protos.UserInputs.create({ inputs: payload as protos.Input[] } as protos.IUserInputs)
      ).finish();
      break;
    default:
      console.log('ERROR: trying to create TCP Packet with unknown message type');
      encodedPayload = new Uint8Array();
      break;
  }

  const msgLength = Buffer.byteLength(encodedPayload);
  const msgLengthArr = new Uint8Array([msgLength & 0x00ff, msgLength & 0xff00]); // Assuming little-endian byte order, since runs on x64
  const msgTypeArr = new Uint8Array([messageType]);

  return Buffer.concat([Buffer.from(msgTypeArr.buffer), Buffer.from(msgLengthArr.buffer), Buffer.from(encodedPayload.buffer)], msgLength + 3);
}

export class RuntimeConnection {
  currentIp: string = DEFAULT_CONNECTION_IP;
  loggerName: string = 'RuntimeConnection';
  logger: Logger = new Logger(this.loggerName);
  socket: WebSocket | undefined;
  leftoverBytes: Buffer | undefined;
  isConnecting: boolean = false;
  socketReady: boolean = false;

  constructor() {
    this.tick();
  }

  private openNewConnection() {
    this.isConnecting = true;

    const ip = this.currentIp;

    if (ip.includes(':')) {
      // ip most likely already includes port, so no need to use `DEFAULT_CONNECTION_PORT`
      this.socket = new WebSocket(`ws://${ip}`);
    } else {
      this.socket = new WebSocket(`ws://${ip}:${DEFAULT_CONNECTION_PORT}`);
    }

    this.socket.addEventListener('open', () => {
      this.logger.log('connected');
      this.socketReady = true;
      this.socket!.send(new Uint8Array([1])); // Runtime needs first byte to be 1 to recognize client as Dawn (instead of Shepherd)
    });

    this.socket.addEventListener('end', () => {
      this.logger.log('Runtime disconnected');
    });

    this.socket.addEventListener('error', (ev: Event) => {
      this.logger.log(`Encountered error -- ${ev}`);
    });

    /**
     * Runtime TCP Message Handler.
     * TODO: Distinguish between challenge outputs and console logs
     * when using payload to update console
     */
    this.socket.addEventListener('message', async (message: MessageEvent<Blob>) => {
      // this.logger.log('Received message');
      const dataArrayBuffer = await message.data.arrayBuffer();
      const { leftoverBytes, processedTCPPackets } = readPackets(Buffer.from(dataArrayBuffer), this.leftoverBytes);

      for (const packet of processedTCPPackets) {
        let decoded;

        switch (packet.type) {
          case MsgType.TIME_STAMPS:
            decoded = protos.TimeStamps.decode(packet.payload);
            const oneWayLatency = (Date.now() - Number(decoded.dawnTimestamp)) / 2;
            this.logger.log(`${this.loggerName}: oneWayLatency -- ${oneWayLatency} msec`);

            // TODO: use `oneWayLatency` in UI
            break;
          
          case MsgType.DEVICE_DATA:
            try {
              const sensorData: protos.Device[] = protos.DevData.decode(packet.payload).devices;
              this.logger.log(`sensorData -- ${JSON.stringify(sensorData)}`)
            } catch (err) {
              this.logger.log(err);
            }
            break;

          default:
            this.logger.log(`Unsupported received message type: ${packet.type}`)
        }
      }

      this.leftoverBytes = leftoverBytes;
    });

    this.isConnecting = false;
  }

  private tick = () => {
    console.log('socket connected', this.socketReady);
    console.log('socket is connecting', this.isConnecting);
    console.log('current ip', this.currentIp);
    console.log('\n');

    if (this.socket === undefined && !this.isConnecting) {
      this.openNewConnection();
    }  

    setTimeout(this.tick, 5000);
  }

  public connect = (newIp: string) => {
    if (newIp === this.currentIp) {
      // Same ip, no need to reconnect
      return;
    }

    if (this.socketReady) {
      this.logger.log(`Closed existing connection to connect to new ip: ${newIp}`);
      // Close existing connected socket to open new connection with new ip
      this.socket?.close();
      this.socket = undefined;
    }

    this.currentIp = newIp;
    this.openNewConnection();
  }

  /**
   * Initiates latency check by sending first packet to Runtime
   */
  public initiateLatencyCheck = (data: protos.ITimeStamps) => {
    const message = createPacket(data, MsgType.TIME_STAMPS);
    this.socket?.send(message);
  };

  public sendRunMode = (runModeData: protos.IRunMode) => {
    if (!this.socketReady) {
      return;
    }

    const message = createPacket(runModeData, MsgType.RUN_MODE);
    this.socket?.send(message);
    this.logger.log(`Sent run mode data -- ${JSON.stringify(runModeData)}\n`);
  };

  public sendInputs = (data: protos.Input[], source: protos.Source) => {
    if (data.length === 0) {
      data.push(
        protos.Input.create({
          connected: false,
          source
        })
      );
    }
    const message = createPacket(data, MsgType.INPUTS);
    this.socket?.send(message);
  };

  close = () => {
    this.logger.log('Closed socket connection');
    this.socket?.close();
    this.socketReady = false;
  };
}
