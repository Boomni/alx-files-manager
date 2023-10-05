import path from 'path';
import mime from 'mime-types';
import { redisClient } from '../utils/redis';
import dbClient from '../utils/db';

const { getMongoInstance, ObjectId } = require('mongodb');
const uuid4 = require('uuid').v4;
const fs = require('fs');

const rootDir = process.env.FOLDERPATH || '/tmp/files_manager';

class FilesController {
  static async postUpload(req, res) {
    // get files collection
    // const files = await dbClient.db.connection('files');
    const db = dbClient.client.db();
    const files = db.collection('files');

    // retrieve user based on token
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    // validate data from requests
    const data = { ...req.body };
    if (!data.name) return res.status(400).send({ error: 'Missing name' });
    if (!data.type) return res.status(400).send({ error: 'Missing type' });
    if (!['folder', 'file', 'image'].includes(data.type)) {
      return res.status(400).send({ error: 'Missing type' });
    }
    if (data.type !== 'folder' && !data.data) {
      return res.status(400).send({ error: 'Missing data' });
    }
    if (data.parentId) {
      const queryResult = await files.findOne({ _id: ObjectId(data.parentId) });
      if (!queryResult) {
        return res.status(400).send({ error: 'Parent not found' });
      }
      if (queryResult.type !== 'folder') {
        return res.status(400).send({ error: 'Parent is not a folder' });
      }
    }

    if (data.type !== 'folder') {
      const fileUUID = uuid4();
      data.localPath = fileUUID;
      const content = Buffer.from(data.data, 'base64');

      fs.mkdir(rootDir, { recursive: true }, (error) => {
        if (error) {
          console.log(error);
        }
        fs.writeFile(`${rootDir}/${fileUUID}`, content, (error) => {
          if (error) {
            console.log(error);
          }
          return true;
        });
        return true;
      });
    }

    // save file
    data.userId = userId;
    const parentId = req.body.parentId || 0;
    data.parentId = parentId;
    data.isPublic = data.isPublic || false;
    delete data.data;
    const queryResult = await files.insertOne(data);
    const objFromQuery = { ...queryResult.ops[0] };
    delete objFromQuery.localPath;
    return res
      .status(201)
      .send({ ...objFromQuery, id: queryResult.insertedId });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const fileId = req.params.id;

    const file = await dbClient.client.db()
      .collection('files')
      .findOne({ _id: ObjectId(fileId), userId });

    if (!file) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json(file);
  }

  static async getIndex(request, response) {
    // Retrieve the user based on the token
    const token = request.headers['x-token'];
    if (!token) return response.status(401).json({ error: 'Unauthorized' });
    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) return response.status(401).json({ error: 'Unauthorized' });
    const parentId = request.query.parentId || '0';
    const pagination = request.query.page || 0;
    const user = await dbClient.client.db().collection('users').findOne({ _id: ObjectId(keyID) });
    if (!user) response.status(401).json({ error: 'Unauthorized' });

    const aggregationMatch = { $and: [{ parentId }] };
    let aggregateData = [
      { $match: aggregationMatch },
      { $skip: pagination * 20 },
      { $limit: 20 },
    ];
    if (parentId === 0) aggregateData = [{ $skip: pagination * 20 }, { $limit: 20 }];

    const files = await dbClient.client.db()
      .collection('files')
      .aggregate(aggregateData);
    const filesArray = [];
    await files.forEach((item) => {
      const fileItem = {
        id: item._id,
        userId: item.userId,
        name: item.name,
        type: item.type,
        isPublic: item.isPublic,
        parentId: item.parentId,
      };
      filesArray.push(fileItem);
    });

    return response.send(filesArray);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = await dbClient.client.db()
      .collection('files')
      .findOneAndUpdate(
        { _id: ObjectId(fileId), userId },
        { $set: { isPublic: true } },
        { returnOriginal: false },
      );

    if (!file.value) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json(file.value);
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const fileId = req.params.id;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = await dbClient.client.db()
      .collection('files')
      .findOneAndUpdate(
        { _id: ObjectId(fileId), userId },
        { $set: { isPublic: false } },
        { returnOriginal: false },
      );

    if (!file.value) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json(file.value);
  }

  static async getFile(req, res) {
    try {
      const fileId = req.params.id;
      const { userId } = req;
      const filesCollection = getMongoInstance().db().collection('files');
      const file = await filesCollection.findOne({ _id: ObjectId(fileId) });

      if (!file) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      if (!file.isPublic && (!userId || file.userId !== userId.toString())) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      if (file.type === 'folder') {
        res.status(400).json({ error: "A folder doesn't have content" });
        return;
      }

      const filePath = path.join(__dirname, '..', 'uploads', file.id.toString());
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      const mimeType = mime.lookup(file.name);
      const fileStream = fs.createReadStream(filePath);
      fileStream.on('open', () => {
        res.set('Content-Type', mimeType);
        fileStream.pipe(res);
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = FilesController;
