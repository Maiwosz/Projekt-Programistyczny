const mongoose = require('mongoose');

const connectDB = () => {
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log('Po��czono z MongoDB');
};

module.exports = connectDB;