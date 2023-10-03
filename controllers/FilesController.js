import { ObjectId } from 'mongodb';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { mkdir, writeFile } from 'fs';
import { redisClient } from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postFiles(request, response) {
    const fileQ = new Queue('fileQ');
    const dir = process.env.FOLDER_PATH || '/tmp/files_manager';
    const token = request.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) response.status(401).send({ error: 'Unauthorized' });
    const name = request.body('name');
    if (!name) response.status(400).send({ error: 'Missing name' });
    const type = request.body('type');
    const acceptedTypes = ['folder', 'file', 'image'];
    if (!type || (!acceptedTypes.includes(type))) {
      response.status(400).send({ error: 'Missing type' });
    }
    const parentId = request.body('parentId') || 0;
    const isPublic = request.body('isPublic') || false;
    if (type === 'file' || type === 'image') {
      const data = request.body('data');
      if (!data) response.status(400).send({ error: 'Missing data' });
    }
    if (parentId !== 0) {
      const file = await dbClient.client.db().collection('files').findOne({ _id: ObjectId(parentId) });
      if (!file) response.status(400).send({ error: 'Parent not found' });
      if (file.type !== 'folder') return response.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileInsertData = {
      userId: ObjectId(id),
      name,
      type,
      isPublic,
      parentId,
    };
    if (type === 'folder') {
      await dbClient.client.db().collection('files').insertOne(fileInsertData);
      return response.status(201).send({
        id: fileInsertData._id,
        userId: fileInsertData.userId,
        name: fileInsertData.name,
        type: fileInsertData.type,
        isPublic: fileInsertData.isPublic,
        parentId: fileInsertData.parentId,
      });
    }
    const fileUid = uuidv4();
    const dataa = request.body('data');
    const decData = Buffer.from(dataa, 'base64');
    const filePath = `${dir}/${fileUid}`;
    mkdir(dir, { recursive: true }, (error) => {
      if (error) return response.status(400).send({ error: error.message });
      return true;
    });

    writeFile(filePath, decData, (error) => {
      if (error) return response.status(400).send({ error: error.message });
      return true;
    });

    fileInsertData.localPath = filePath;
    await dbClient.client.db().collection('files').insertOne(fileInsertData);

    fileQ.add({
      userId: fileInsertData.userId,
      fileId: fileInsertData._id,
    });

    return response.status(201).send({
      id: fileInsertData._id,
      userId: fileInsertData.userId,
      name: fileInsertData.name,
      type: fileInsertData.type,
      isPublic: fileInsertData.isPublic,
      parentId: fileInsertData.parentId,
    });
  }
}

module.exports = FilesController;
