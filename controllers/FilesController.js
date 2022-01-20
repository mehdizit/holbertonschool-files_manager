import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { promises as fsPromises } from 'fs';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fs = require('fs');
const Bull = require('bull');

const fileQueue = new Bull('fileQueue');

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

class FilesController {
  static async postUpload(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });

    // req handlers
    const fileTypes = ['folder', 'file', 'image'];
    const {
      name, type, parentId, isPublic, data,
    } = req.body;

    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!type || !fileTypes.includes(type)) return res.status(400).send({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });

    // create general folder if not exists
    if (!fs.existsSync(FOLDER_PATH)) {
      fs.mkdirSync(FOLDER_PATH, {
        recursive: true,
      });
    }

    // check for parentId
    if (parentId) {
      const fileExist = await dbClient.FilesCollection.findOne({ _id: ObjectId(parentId) });
      if (!fileExist) return res.status(400).send({ error: 'Parent not found' });
      if (fileExist.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    // create folder records in db
    if (type === 'folder') {
      const newFolder = {
        userId: user._id,
        name,
        type,
        parentId: 0,
      };
      if (parentId) newFolder.parentId = ObjectId(parentId);
      const result = await dbClient.FilesCollection.insertOne(newFolder);
      return res.status(201).json({
        id: result.insertedId,
        ...newFolder,
        isPublic: isPublic || false,
      });
    }

    // Save local files
    const filename = uuidv4();
    const localPath = `${FOLDER_PATH}/${filename}`;
    const decodedData = Buffer.from(data, 'base64');
    // const decodedData = Buffer.from(data, 'base64').toString();

    fs.writeFileSync(localPath, decodedData, (err) => {
      if (err) throw err;
    });

    // save file document in DB
    const newFile = {
      userId: user._id,
      name,
      type,
      isPublic: isPublic || false,
      parentId: 0,
      localPath,
    };
    if (parentId) newFile.parentId = ObjectId(parentId);

    const result = await dbClient.FilesCollection.insertOne(newFile);
    if (type === 'image') {
      await fileQueue.add({
        userId: user._id,
        fileId: result.insertedId,
      });
    }
    delete newFile.localPath;
    delete newFile._id;
    newFile.parentId = newFile.parentId === '0' ? 0 : newFile.parentId;
    return res.status(201).json({
      id: result.insertedId,
      ...newFile,
    });
  }

  static async getShow(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const fileExist = await dbClient.FilesCollection.findOne({
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    });

    if (!fileExist) return res.status(404).json({ error: 'Not found' });
    fileExist.id = fileExist._id;
    delete fileExist._id;
    delete fileExist.localPath;
    return res.status(200).json({
      ...fileExist,
    });
  }

  static async getIndex(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let parentId = req.query.parentId || '0';
    if (parentId === '0') parentId = 0;
    let page = Number(req.query.page) || 0;

    if (Number.isNaN(page)) page = 0;

    if (parentId !== 0 && parentId !== '0') {
      parentId = ObjectId(parentId);
      const folder = await dbClient.FilesCollection.findOne({
        _id: parentId,
      });

      if (!folder || folder.type !== 'folder') return res.status(200).send([]);
    }

    let pipeline = [
      { $match: { parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ];
    if (parentId === 0 || parentId === '0') {
      pipeline = [{ $skip: page * 20 }, { $limit: 20 }];
    }
    const fileCursor = await dbClient.FilesCollection.aggregate(pipeline);
    const fileList = [];
    await fileCursor.forEach((doc) => {
      const document = { id: doc._id, ...doc };
      delete document.localPath;
      delete document._id;
      fileList.push(document);
    });

    return res.status(200).json(fileList);
  }

  static async putPublish(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const fileExist = await dbClient.FilesCollection.findOne(query);

    if (!fileExist) return res.status(404).json({ error: 'Not found' });

    await dbClient.FilesCollection.updateOne(query, { $set: { isPublic: true } });

    fileExist.id = fileExist._id;
    fileExist.isPublic = true;
    delete fileExist._id;
    delete fileExist.localPath;
    return res.status(200).json({
      ...fileExist,
    });
  }

  static async putUnpublish(req, res) {
    // check for x-token header
    const token = req.headers['x-token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const fileExist = await dbClient.FilesCollection.findOne(query);

    if (!fileExist) return res.status(404).json({ error: 'Not found' });

    await dbClient.FilesCollection.updateOne(query, { $set: { isPublic: false } });

    fileExist.id = fileExist._id;
    fileExist.isPublic = false;
    delete fileExist._id;
    delete fileExist.localPath;
    return res.status(200).json({
      ...fileExist,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const { size } = req.query;
    const widths = ['500', '250', '100'];

    let query = {
      _id: ObjectId(fileId),
    };
    const fileExist = await dbClient.FilesCollection.findOne(query);
    if (!fileExist) return res.status(404).json({ error: 'Not found' });
    const {
      isPublic, type, name,
    } = fileExist;
    let { localPath } = fileExist;
    // check for x-token header
    const token = req.headers['x-token'];

    // verify token
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    query = {
      userId: ObjectId(userId),
      _id: ObjectId(fileId),
    };
    const owner = await dbClient.FilesCollection.findOne(query);

    if ((isPublic === false && !userId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if ((isPublic === false && !owner)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (type === 'folder') return res.status(400).json({ error: 'A folder doesn\'t have content' });

    const mimeType = mime.contentType(name);
    res.setHeader('Content-Type', mimeType);
    let data;
    try {
      if (size) localPath = `${localPath}_${size}`;
      if (size && !widths.includes(size)) return res.status(404).json({ error: 'Not found' });
      data = await fsPromises.readFile(localPath);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).send(data);
  }
}

module.exports = FilesController;
