import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const sha1 = require('sha1');
const Bull = require('bull');

const userQueue = new Bull('userQueue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });

    if (await dbClient.UsersCollection.findOne({ email })) return res.status(400).send({ error: 'Already exist' });

    const shaPassword = sha1(password);
    const newUser = {
      email,
      password: shaPassword,
    };

    const result = await dbClient.UsersCollection.insertOne(newUser);
    console.log(result.insertedId);
    await userQueue.add({
      userId: result.insertedId,
    });
    return res.status(201).json({ id: result.ops[0]._id, email: result.ops[0].email });
  }

  static async getMe(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    // verify token
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });
    return res.status(200).json({ id: userId, email: user.email });
  }
}

module.exports = UsersController;
