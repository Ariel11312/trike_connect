import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    text: { 
        type: String, 
        required: true 
    },
    read: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

// ES6 export
export default mongoose.model('Message', messageSchema);