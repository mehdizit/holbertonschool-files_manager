import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const Bull = require('bull');
const fs = require('fs');
const imageThumbnail = require('image-thumbnail');

const fileQueue = new Bull('fileQueue');
const userQueue = new Bull('userQueue');

fileQueue.process(async (job) => {
  const widths = [500, 250, 100];
  const { fileId, userId } = job.data;
  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');
  const fileExist = await dbClient.FilesCollection.findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });
  if (!fileExist) throw new Error('File not found');

  widths.forEach(async (width) => {
    const options = { width };
    const { localPath } = fileExist;
    try {
      const thumbnail = await imageThumbnail(localPath, options);
      fs.writeFileSync(`${localPath}_${width}`, thumbnail, (err) => {
        if (err) throw err;
      });
      // console.log(thumbnail);
    } catch (err) {
      console.error('this error', err.message);
    }
  });
});

userQueue.process(async (job) => {
  const { userId } = job.data;

  if (!userId) {
    console.log('Missing userId');
    throw new Error('Missing userId');
  }

  const user = await dbClient.UsersCollection.findOne({ _id: ObjectId(userId) });

  if (!user) throw new Error('User not found');

  console.log(`Welcome ${user.email}!`);
});
