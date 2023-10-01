import sha1 from 'sha1';
import dbClient from '../utils/db';

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
}

module.exports = UsersController;
