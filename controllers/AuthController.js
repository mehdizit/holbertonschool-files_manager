import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const sha1 = require('sha1');

class AuthController {
  static async getConnect(req, res) {
    // check for basic auth header
    if (!req.headers.authorization || req.headers.authorization.indexOf('Basic ') === -1) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // verify auth credentials
    const base64Credentials = req.headers.authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString();
    const [email, password] = credentials.split(':');

    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    // Get user from DB
    const shaPassword = sha1(password);
    const user = await dbClient.UsersCollection.findOne({
      email,
      password: shaPassword,
    });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Generate token 24 H
    const ranToken = uuidv4();
    const key = `auth_${ranToken}`;
    await redisClient.set(key, user._id.toString(), 60 * 60 * 24);
    return res.status(200).json({ token: ranToken });
  }

  static async getDisconnect(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    // verify token
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // delete token
    await redisClient.del(key);
    return res.status(204).send();
  }
}

module.exports = AuthController;
