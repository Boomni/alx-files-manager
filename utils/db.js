import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    const uri = `mongodb://${host}:${port}/${database}`;

    this.client = new MongoClient(uri, { useUnifiedTopology: true });
    this.client.connect();
  }

  isAlive() {
    return this.client && this.client.topology.isConnected();
  }

  async nbUsers() {
    return new Promise((resolve, reject) => {
      this.client.db().collection('users').countDocuments((err, count) => {
        if (err) {
          console.error(`Error in nbUsers: ${err}`);
          reject(err);
        } else {
          resolve(count);
        }
      });
    });
  }

  async nbFiles() {
    return new Promise((resolve, reject) => {
      this.client.db().collection('files').countDocuments((err, count) => {
        if (err) {
          console.error(`Error in nbFiles: ${err}`);
          reject(err);
        } else {
          resolve(count);
        }
      });
    });
  }
}

const dbClient = new DBClient();
module.exports = dbClient;
