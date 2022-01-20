import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    // variables
    this.DB_HOST = process.env.DB_HOST || 'localhost';
    this.DB_PORT = process.env.DB_PORT || 27017;
    this.DB_DATABASE = process.env.DB_DATABASE || 'files_manager';
    this.url = `mongodb://${this.DB_HOST}:${this.DB_PORT}`;

    // connect to MongoDB
    MongoClient.connect(this.url, { useUnifiedTopology: true }, (err, client) => {
      if (!err) {
        this.client = client;
        this.db = client.db(this.DB_DATABASE);
        this.UsersCollection = this.db.collection('users');
        this.FilesCollection = this.db.collection('files');
      } else {
        console.log(err.message);
        this.db = false;
      }
    });
  }

  isAlive() {
    return !!this.client && !!this.client.topology && this.client.topology.isConnected();
  }

  async nbUsers() {
    return this.UsersCollection.countDocuments();
  }

  async nbFiles() {
    return this.FilesCollection.countDocuments();
  }
}

const dbClient = new DBClient();

export default dbClient;
