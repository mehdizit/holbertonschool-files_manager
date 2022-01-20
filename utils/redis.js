import { createClient } from 'redis';

const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = createClient();
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setExAsync = promisify(this.client.setex).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
    this.client.on('error', (err) => console.log(`Redis client not connected to the server: ${err}`));
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const res = await this.getAsync(key);
    return res;
  }

  async set(key, value, duration) {
    this.setExAsync(key, duration, value);
  }

  async del(key) {
    this.delAsync(key);
  }
}

const redisClient = new RedisClient();

export default redisClient;
