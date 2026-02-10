import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const chatSchema = new Schema({
    members: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }],
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length >= 2;
            },
            message: 'Chat must have at least 2 members'
        }
    },
    lastMessage: {
        type: Schema.Types.ObjectId,
        ref: 'Message'
    },
    unreadMessageCount: { type: Number, default: 0 }
}, { timestamps: true });

// Static method to find or create chat
chatSchema.statics.findOrCreate = async function(memberIds) {
    if (!Array.isArray(memberIds) || memberIds.length < 2) {
        throw new Error('Members array must contain at least 2 user IDs');
    }
    
    // Convert to ObjectId and sort
    const sortedMembers = memberIds
        .map(id => new mongoose.Types.ObjectId(id))
        .sort((a, b) => a.toString().localeCompare(b.toString()));
    
    // Try to find existing chat
    const existingChat = await this.findOne({
        members: { 
            $all: sortedMembers,
            $size: sortedMembers.length 
        }
    }).populate('members', 'firstname lastname email');
    
    if (existingChat) {
        return existingChat;
    }
    
    // Create new chat
    const chat = new this({
        members: sortedMembers,
        unreadMessageCount: 0
    });
    
    await chat.save();
    return chat.populate('members', 'firstname lastname email');
};

// Index for faster queries
chatSchema.index({ members: 1 });

const Chat = model('Chat', chatSchema);
export default Chat;