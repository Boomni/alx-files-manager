import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const db = dbClient.client.db();
    const users = db.collection('users');
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    let queryResult = await users.findOne({ email });
    if (queryResult) {
      return res.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = sha1(password);
    const newUser = {
      email,
      password: hashedPassword,
    };

    queryResult = await users.insertOne(newUser);
    return res.status(201).send({ id: queryResult.insertedId, email });
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (userId) {
      const user = await dbClient.findOne('users', { _id: ObjectId(userId) });
      if (user) {
        return res.status(200).json({ id: user._id, email: user.email });
      }
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = UsersController;
