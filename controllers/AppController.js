import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static getStatus(req, res) {
    const redisStatus = redisClient.isAlive();
    const dbStatus = dbClient.isAlive();

    res.status(200);
    res.json({
      redis: redisStatus,
      db: dbStatus,
    });
  }

  static async getStats(req, res) {
    res.status(200);
    const nbUsers = await dbClient.nbUsers();
    const nbFiles = await dbClient.nbFiles();

    res.json({
      users: nbUsers,
      files: nbFiles,
    });
  }
}

module.exports = AppController;
