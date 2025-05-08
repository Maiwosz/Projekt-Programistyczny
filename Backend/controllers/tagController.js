const Tag = require('../models/Tag');
const mogoose = require('mongoose');

exports.createTag = async (req, res) => {
    // try {
    //     const { name } = req.body;

    //     if (!name) {
    //         return res.status(400).json({ error: 'Nazwa tagu jest wymagana' });
    //     }

    //     const existingTag = await Tag.findOne({
    //         user: req.user.userId,
    //         name: name
    //     });

    //     if (existingTag) {
    //         return res.status(400).json({ error: 'Tag o tej nazwie już istnieje' });
    //     }

    //     const tag = new Tag({
    //         user: req.user.userId,
    //         name,
    //     });

    //     await tag.save();
    //     res.status(201).json(tag);
    // } catch (err) {
    //     res.status(500).json({ error: 'Błąd tworzenia tagu' });
    // }
}

