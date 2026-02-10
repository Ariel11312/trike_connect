import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';


// Types
interface User {
  _id?: string;
  id?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
}

interface Message {
  _id: string;
  sender: string | User;
  text: string;
  chatId: string;
  createdAt: string;
}

interface Chat {
  _id: string;
  members: User[];
  lastMessage?: Message;
  updatedAt?: string;
}

interface FormattedMessage {
  id: string;
  sender: string;
  avatar: string;
  content: string;
  time: string;
  isUser: boolean;
}

interface TypingData {
  chatId: string;
  timestamp: number;
}

import { createNewChat, getAllChats } from '../services/ChatService';

// CONFIGURATION - Update these values
const SOCKET_URL = 'http://192.168.100.37:5000'; // Make sure this matches your server
const API_URL = 'http://192.168.100.37:5000';

const ChatInterface: React.FC = () => {
  const [message, setMessage] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [searchKey, setSearchKey] = useState<string>('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [allMessages, setAllMessages] = useState<FormattedMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [userID, setUserId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingData>>(new Map());
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string>('');

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const reconnectAttemptRef = useRef<number>(0);
    const [messages, setMessages] = useState([]);

  useEffect(() => {
    // When messages load, mark the latest as read
    if (messages && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      markMessagesAsRead(latestMessage._id);
    }
  }, [messages]);

  const markMessagesAsRead = async (messageId: string) => {
    try {
      await AsyncStorage.setItem('@driver_last_read_message', messageId);
      console.log('✅ Messages marked as read:', messageId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Setup socket event listeners
  const setupSocketListeners = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    console.log('Setting up socket listeners...');
    socket.removeAllListeners();

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to server with ID:', socket.id);
      setSocketConnected(true);
      setConnectionError('');
      reconnectAttemptRef.current = 0;

      if (userID) {
        console.log('Emitting user-online event for:', userID);
        socket.emit('user-online', userID);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server. Reason:', reason);
      setSocketConnected(false);
      setConnectionError(`Disconnected: ${reason}`);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('❌ Connection error:', error.message);
      setSocketConnected(false);
      reconnectAttemptRef.current++;
      setConnectionError(`Connection failed (attempt ${reconnectAttemptRef.current}): ${error.message}`);
    });

    // Real-time message receiving
    socket.on('receive-message', (messageData: any) => {
      console.log('📨 Received message:', messageData);
      handleIncomingMessage(messageData);
    });

    // Online users updates
    socket.on('users-online', (users: string[]) => {
      console.log('👥 Online users:', users);
      setOnlineUsers(new Set(users));
    });

    socket.on('user-connected', (userId: string) => {
      console.log('✅ User connected:', userId);
      setOnlineUsers(prev => new Set([...prev, userId]));
    });

    socket.on('user-disconnected', (userId: string) => {
      console.log('❌ User disconnected:', userId);
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    });

    // Typing indicators
    socket.on('user-typing', ({ userId, chatId, isTyping }: { userId: string; chatId: string; isTyping: boolean }) => {
      if (userId !== userID) {
        setTypingUsers(prev => {
          const newMap = new Map(prev);
          if (isTyping) {
            newMap.set(userId, { chatId, timestamp: Date.now() });
          } else {
            newMap.delete(userId);
          }
          return newMap;
        });
      }
    });

    // Message status updates
    socket.on('message-delivered', ({ messageId, chatId }: { messageId: string; chatId: string }) => {
      console.log('✓ Message delivered:', messageId);
    });

    socket.on('message-read', ({ messageId, chatId }: { messageId: string; chatId: string }) => {
      console.log('✓✓ Message read:', messageId);
    });
  }, [userID]);

  // Handle incoming messages
  const handleIncomingMessage = useCallback((messageData: any) => {
    const { message, chat } = messageData;

    setSelectedChat(currentSelectedChat => {
      if (currentSelectedChat && currentSelectedChat._id === chat._id) {
        setCurrentUser((currentUserData: any) => {
          if (currentUserData?.data?._id) {
            const formattedMessage = formatMessageForDisplay(message, currentUserData.data._id);
            setAllMessages(prevMessages => {
              const messageExists = prevMessages.some(msg => msg.id === message._id);
              if (!messageExists) {
                return [...prevMessages, formattedMessage];
              }
              return prevMessages;
            });

            setTimeout(() => scrollToBottom(), 100);
          }
          return currentUserData;
        });
      }
      return currentSelectedChat;
    });

    // Update chat list
    setAllChats(prevChats =>
      prevChats.map(existingChat =>
        existingChat._id === chat._id
          ? {
            ...existingChat,
            lastMessage: message,
            updatedAt: new Date().toISOString()
          }
          : existingChat
      )
    );
  }, []);

  // Initialize socket connection
  useEffect(() => {
    console.log('🔌 Initializing socket connection...');

    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      });

      console.log('✅ Socket instance created');
    }

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  // Setup socket listeners when socket and userID are ready
  useEffect(() => {
    if (socketRef.current && userID) {
      console.log('🔧 Setting up socket listeners for user:', userID);
      setupSocketListeners();
    }
  }, [userID, setupSocketListeners]);

  // Connect socket when user is available
  useEffect(() => {
    const socket = socketRef.current;

    if (!socket || !userID) {
      console.log('⏳ Waiting for socket and userID...', { hasSocket: !!socket, userID });
      return;
    }

    if (!socket.connected) {
      console.log('🔌 Connecting socket for user:', userID);

      socket.connect();

      const onConnect = () => {
        console.log('✅ Socket connected successfully, emitting user-online');
        socket.emit('user-online', userID);
      };

      if (socket.connected) {
        onConnect();
      } else {
        socket.once('connect', onConnect);
      }
    }

    return () => {
      if (socket.connected) {
        console.log('🔌 Disconnecting socket for user:', userID);
        socket.disconnect();
      }
    };
  }, [userID]);

  // Scroll to bottom
  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Handle typing indicators
  const handleTyping = () => {
    if (!selectedChat || !userID || !socketRef.current?.connected) return;

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current.emit('typing', {
        userId: userID,
        chatId: selectedChat._id,
        isTyping: true
      });
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      if (socketRef.current?.connected) {
        socketRef.current.emit('typing', {
          userId: userID,
          chatId: selectedChat._id,
          isTyping: false
        });
      }
    }, 1000);
  };

  // Join/leave chat rooms
  useEffect(() => {
    if (selectedChat && socketRef.current?.connected) {
      console.log('🚪 Joining chat room:', selectedChat._id);
      socketRef.current.emit('join-chat', selectedChat._id);

      return () => {
        if (socketRef.current?.connected) {
          console.log('🚪 Leaving chat room:', selectedChat._id);
          socketRef.current.emit('leave-chat', selectedChat._id);
        }
      };
    }
  }, [selectedChat?._id, socketConnected]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (allMessages.length > 0) {
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [allMessages]);

  // Check if user is online
  const isUserOnline = (userId: string): boolean => {
    return onlineUsers.has(userId);
  };

  // Get typing users for current chat
  const getTypingUsersForChat = (): User[] => {
    if (!selectedChat) return [];

    const typingInCurrentChat: User[] = [];
    typingUsers.forEach((data, userId) => {
      if (data.chatId === selectedChat._id) {
        const user = selectedChat.members?.find(member =>
          (member._id || member.id) === userId
        ) || allUsers.find(user => (user._id || user.id) === userId);
        if (user) {
          typingInCurrentChat.push(user);
        }
      }
    });

    return typingInCurrentChat;
  };

  const fetchAllUsers = async () => {
    try {
      console.log('📥 Fetching all users...');
      const response = await fetch(`${API_URL}/api/auth/get-all-user`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const users = Array.isArray(data?.data) ? data.data : [];
        setAllUsers(users);
        console.log('✅ Loaded', users.length, 'users');
      } else {
        console.error('❌ Failed to fetch users:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching users:', error);
    }
  };

  const getCurrentUserChat = async () => {
    try {
      console.log('📥 Fetching chats...');

      const response = await fetch(`${API_URL}/api/chat/get-all-chats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error:', response.status, errorText);
        setAllChats([]);
        return;
      }

      const data = await response.json();
      console.log('Chats API response data:', data);

      if (data.success) {
        const chatData = data.data;
        const chatsArray = Array.isArray(chatData) ? chatData : [chatData].filter(Boolean);
        setAllChats(chatsArray);
        console.log('✅ Successfully loaded', chatsArray.length, 'chats');
      } else {
        console.warn('⚠️ API returned success:false:', data.message);
        setAllChats([]);
      }
    } catch (error) {
      console.error('❌ Error fetching chats:', error);
      setAllChats([]);
    }
  };

  const getCurrentUserId = async () => {
    try {
      console.log('📥 Fetching current user...');
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();

        // Extract user ID from various possible structures
        // Try different field names: _id, id
        const userId = data?.data?._id ||
          data?.data?.id ||
          data?._id ||
          data?.id ||
          data?.user?._id ||
          data?.user?.id;

        if (userId) {
          console.log('✅ Current user ID:', userId);
          setUserId(userId);

          // Normalize user data structure
          const userData = data.data || data.user || data;

          // If the user object has 'id' instead of '_id', add '_id' for consistency
          if (userData.id && !userData._id) {
            userData._id = userData.id;
          }

          setCurrentUser({ data: userData });
          return userId;
        } else {
          console.error('❌ No user ID found in response:', data);
        }
      } else {
        console.error('❌ Failed to fetch current user:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching current user:', error);
    }
    return null;
  };

  const hasExistingChat = (userId: string): boolean => {
    if (!allChats.length || !currentUser?.data?._id) return false;

    return allChats.some(chat => {
      const memberIds = chat.members?.map(m => m._id || m.id) || [];
      return memberIds.includes(userId) && memberIds.includes(currentUser.data._id);
    });
  };

  const getExistingChat = (userId: string): Chat | null => {
    if (!allChats.length || !currentUser?.data?._id) return null;

    return allChats.find(chat => {
      const memberIds = chat.members?.map(m => m._id || m.id) || [];
      return memberIds.includes(userId) && memberIds.includes(currentUser.data._id);
    }) || null;
  };

  const getChatTitle = (chat: Chat): string => {
    if (!chat?.members || !currentUser?.data?._id) return 'Chat';

    const otherMembers = chat.members.filter(member =>
      (member._id || member.id) !== currentUser.data._id
    );

    if (otherMembers.length === 0) return 'Just You';
    if (otherMembers.length === 1) {
      const member = otherMembers[0];
      return `${member.firstname || ''} ${member.lastname || ''}`.trim() || member.email || 'Unknown User';
    }

    return `Group Chat (${chat.members.length} members)`;
  };

  const getInitials = (firstname?: string, lastname?: string): string => {
    const first = firstname ? firstname.charAt(0).toUpperCase() : '';
    const last = lastname ? lastname.charAt(0).toUpperCase() : '';
    return first + last || 'U';
  };

  const formatMessageForDisplay = (msg: Message, currentUserId: string): FormattedMessage => {
    const senderId = typeof msg.sender === 'string' ? msg.sender : (msg.sender?._id || msg.sender?.id);
    const isCurrentUser = senderId === currentUserId;

    let senderName = 'Unknown';
    let senderInitials = 'U';

    if (isCurrentUser) {
      senderName = 'You';
      senderInitials = getInitials(currentUser?.data?.firstname, currentUser?.data?.lastname);
    } else if (typeof msg.sender === 'object' && msg.sender?.firstname) {
      senderName = `${msg.sender.firstname} ${msg.sender.lastname}`.trim();
      senderInitials = getInitials(msg.sender.firstname, msg.sender.lastname);
    } else if (selectedChat?.members) {
      const senderMember = selectedChat.members.find(member =>
        (member._id || member.id) === senderId
      );
      if (senderMember) {
        senderName = `${senderMember.firstname || ''} ${senderMember.lastname || ''}`.trim() || senderMember.email || 'Unknown';
        senderInitials = getInitials(senderMember.firstname, senderMember.lastname);
      }
    }

    return {
      id: msg._id,
      sender: senderName,
      avatar: senderInitials,
      content: msg.text,
      time: msg.createdAt || new Date().toISOString(),
      isUser: isCurrentUser
    };
  };

  const getLastMessage = (userId: string): string => {
    if (!allChats.length || !currentUser?.data?._id) return "No messages yet";

    const chat = allChats.find(c =>
      c.members?.some(m => (m._id || m.id) === userId) &&
      c.members?.some(m => (m._id || m.id) === currentUser.data._id)
    );

    if (!chat) return "Start new conversation";

    if (chat.lastMessage?.text) {
      return chat.lastMessage.text.length > 50
        ? chat.lastMessage.text.substring(0, 50) + "..."
        : chat.lastMessage.text;
    }

    return "No messages yet";
  };

  const getLastMessageTime = (userId: string): string => {
    const chat = allChats.find(c =>
      c.members?.some(m => (m._id || m.id) === userId) &&
      c.members?.some(m => (m._id || m.id) === currentUser.data._id)
    );

    if (chat?.lastMessage?.createdAt) {
      const messageDate = new Date(chat.lastMessage.createdAt);
      const now = new Date();
      const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return messageDate.toLocaleDateString();
      }
    }

    return '';
  };

  const NewChats = async (searchUserId: string) => {
  try {
    console.log('📝 Creating new chat with user:', searchUserId);
    console.log('Current user ID:', currentUser?.data?._id);

    if (!searchUserId || !currentUser?.data?._id) {
      Alert.alert('Error', 'User information is missing');
      return;
    }

    // Try the most common endpoint first - with SINGLE otherUserId
    let response = await fetch(`${API_URL}/api/chat/create-new-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        otherUserId: searchUserId  // ✅ Fixed: Send single user ID
      }),
    });

    console.log('Create chat response status:', response.status);
    console.log('Response content-type:', response.headers.get('content-type'));

    // If 404, try alternative endpoint
    if (response.status === 404) {
      console.log('Trying alternative endpoint: /api/chat/create');
      response = await fetch(`${API_URL}/api/chat/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          otherUserId: searchUserId  // ✅ Fixed
        }),
      });
      console.log('Alternative endpoint status:', response.status);
    }

    // If still 404, try RESTful endpoint
    if (response.status === 404) {
      console.log('Trying RESTful endpoint: /api/chat');
      response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          otherUserId: searchUserId  // ✅ Fixed
        }),
      });
      console.log('RESTful endpoint status:', response.status);
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMessage = '';

      if (contentType?.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || 'Unknown error';
        console.error('❌ Failed to create chat (JSON):', errorData);
      } else {
        const errorText = await response.text();
        errorMessage = errorText.substring(0, 200); // Limit error text
        console.error('❌ Failed to create chat (Text):', errorText.substring(0, 500));
      }

      Alert.alert(
        'Error Creating Chat',
        `Status: ${response.status}\nError: ${errorMessage}\n\nPlease check:\n1. Backend is running\n2. Endpoint exists\n3. Authentication is valid`
      );
      return;
    }

    const data = await response.json();
    console.log('✅ Chat created response:', data);

    if (data.success) {
      const newChat = data.data.chat;  // ✅ Note: data.data.chat (not just data.data)
      const messages = data.data.messages || [];
      
      console.log('New chat object:', newChat);
      console.log('Messages:', messages);
      
      // Add to chats list if not already present
      setAllChats(prevChats => {
        const exists = prevChats.some(chat => chat._id === newChat._id);
        if (!exists) {
          return [...prevChats, newChat];
        }
        return prevChats;
      });
      
      // Set as selected chat
      setSelectedChat(newChat);
      
      // Format and set messages
      const formattedMessages = messages.map((msg: Message) =>
        formatMessageForDisplay(msg, currentUser?.data?._id)
      );
      setAllMessages(formattedMessages);
      
      setIsSidebarOpen(false);
      
      // Join chat room via socket
      if (socketRef.current?.connected) {
        socketRef.current.emit('join-chat', newChat._id);
      }
    } else {
      console.error('❌ API returned success:false:', data.message);
      Alert.alert('Error', data.message || 'Failed to create chat');
    }
  } catch (error) {
    console.error('❌ Error creating chat:', error);
    Alert.alert(
      'Connection Error',
      'Could not connect to server. Please check:\n1. Backend server is running\n2. Network connection\n3. API URL is correct'
    );
  }
};

  const openChat = (userId: string) => {
    const existingChat = getExistingChat(userId);
    if (existingChat) {
      setSelectedChat(existingChat);
      setIsSidebarOpen(false);
    }
  };

const getAllMessages = async () => {
  if (!selectedChat?._id) return [];

  setLoadingMessages(true);
  try {
    const response = await fetch(`${API_URL}/api/message/get-all-messages/${selectedChat._id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Messages response:', data);
      
      // Handle both old and new response formats
      const messages = data?.data || data || [];
      const messagesArray = Array.isArray(messages) ? messages : [messages].filter(Boolean);

      const formattedMessages = messagesArray.map((msg: Message) =>
        formatMessageForDisplay(msg, currentUser?.data?._id)
      );

      setAllMessages(formattedMessages);
      return messagesArray;
    } else {
      console.error('❌ Failed to fetch messages:', response.status);
      setAllMessages([]);
      return [];
    }
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    setAllMessages([]);
    return [];
  } finally {
    setLoadingMessages(false);
  }
};

const handleMessage = async (messageContent: string, chatId: string): Promise<boolean> => {
    const userId = currentUser?.data?._id;
    
    if (!messageContent.trim() || !chatId || !userId) {
      console.log('❌ Cannot send message - missing data:', { 
        hasMessage: !!messageContent.trim(), 
        hasChatId: !!chatId, 
        hasUserId: !!userId 
      });
      return false;
    }

    setSendingMessage(true);

    try {
      const messageData = {
        chatId: chatId,
        sender: userId,  // ✅ Fixed
        text: messageContent,
      };

      console.log('📤 Sending message:', messageData);

      const response = await fetch(`${API_URL}/api/message/new-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(messageData),
      });

      console.log('Send message response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Message sent successfully:', data);

        const newMessage = formatMessageForDisplay({
          _id: data.data?._id || data._id || Date.now().toString(),
          sender: userId,  // ✅ Fixed
          text: messageContent,
          chatId: chatId,
          createdAt: new Date().toISOString()
        }, userId);  // ✅ Fixed

        // Emit via socket
        if (socketRef.current?.connected) {
          console.log('📡 Emitting message via socket');
          socketRef.current.emit('send-message', {
            message: data.data || data,
            chatId: chatId,
            recipientIds: selectedChat?.members
              .filter(member => (member._id || member.id) !== userId)
              .map(member => member._id || member.id)
          });
        } else {
          console.warn('⚠️ Socket not connected - message not emitted');
        }

        // Update local messages
        setAllMessages(prevMessages => [...prevMessages, newMessage]);

        // Update chat list
        setAllChats(prevChats =>
          prevChats.map(chat =>
            chat._id === chatId
              ? {
                  ...chat,
                  lastMessage: {
                    _id: data.data?._id || data._id,
                    sender: userId,
                    text: messageContent,
                    chatId: chatId,
                    createdAt: new Date().toISOString()
                  },
                  updatedAt: new Date().toISOString()
                }
              : chat
          )
        );

        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to send message:', response.status, errorText);
        Alert.alert('Error', `Failed to send message: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      Alert.alert('Error', 'Could not send message. Please check your connection.');
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    if (selectedChat?._id && currentUser?.data?._id) {
      getAllMessages();
    } else {
      setAllMessages([]);
    }
  }, [selectedChat?._id, currentUser?.data?._id]);

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await getCurrentUserId();
      await Promise.all([
        fetchAllUsers(),
        getCurrentUserChat(),
      ]);
      setLoading(false);
    };
    initializeData();
  }, []);

  const usersToShow = searchKey.trim()
    ? allUsers
    : allUsers.filter(user => hasExistingChat(user._id || user.id));

  const filteredConversations = usersToShow.filter(user =>
    user.firstname?.toLowerCase().includes(searchKey.toLowerCase()) ||
    user.lastname?.toLowerCase().includes(searchKey.toLowerCase()) ||
    `${user.firstname} ${user.lastname}`.toLowerCase().includes(searchKey.toLowerCase())
  );

  const sendMessage = async () => {
    if (message.trim() && selectedChat && !sendingMessage) {
      const messageContent = message.trim();
      setMessage('');

      if (isTyping) {
        setIsTyping(false);
        if (socketRef.current?.connected) {
          socketRef.current.emit('typing', {
            userId: userID,
            chatId: selectedChat._id,
            isTyping: false
          });
        }
      }

      const success = await handleMessage(messageContent, selectedChat._id);

      if (!success) {
        setMessage(messageContent);
      }
    }
  };

  const typingUsersInChat = getTypingUsersForChat();
  const typingText = typingUsersInChat.length > 0
    ? `${typingUsersInChat.map(user => user.firstname || 'Someone').join(', ')} ${typingUsersInChat.length === 1 ? 'is' : 'are'} typing...`
    : '';

  // Render functions
  const renderUserItem = ({ item: user }: { item: User }) => {
  const userId = user._id || user.id;
  const hasChat = hasExistingChat(userId);
  const isSelected = selectedChat && selectedChat.members?.some(m =>
    (m._id || m.id) === userId
  );
  const lastMessage = getLastMessage(userId);
  const lastMessageTime = getLastMessageTime(userId);
  const isOnline = isUserOnline(userId);

  return (
    <TouchableOpacity
      style={[
        styles.userItem,
        isSelected && styles.userItemSelected
      ]}
      onPress={() => {
        if (hasChat) {
          openChat(userId);
        } else {
          // Call NewChats with the user's ID
          NewChats(userId);
        }
      }}
    >
      <View style={styles.userItemContent}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getInitials(user?.firstname, user?.lastname)}
            </Text>
          </View>
          <View style={[
            styles.onlineIndicator,
            { backgroundColor: isOnline ? '#10b981' : '#9ca3af' }
          ]} />
        </View>

        <View style={styles.userInfo}>
          <View style={styles.userHeader}>
            <Text style={styles.userName} numberOfLines={1}>
              {`${user?.firstname || ''} ${user?.lastname || ''}`.trim() || user?.email || 'Unknown User'}
            </Text>
            {!hasChat ? (
              <TouchableOpacity
                style={styles.chatButton}
                onPress={() => NewChats(userId)}
              >
                <Text style={styles.chatButtonText}>Chat</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.timeText}>{lastMessageTime}</Text>
            )}
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessage}
          </Text>
          {hasChat && (
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isOnline ? '#10b981' : '#9ca3af' }
              ]} />
              <Text style={styles.statusText}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

  const renderMessage = ({ item: msg }: { item: FormattedMessage }) => (
    <View style={[
      styles.messageContainer,
      msg.isUser ? styles.messageContainerUser : styles.messageContainerOther
    ]}>
      <View style={[
        styles.messageWrapper,
        msg.isUser && styles.messageWrapperReverse
      ]}>
        <View style={[
          styles.messageAvatar,
          { backgroundColor: msg.isUser ? '#3b82f6' : '#6366f1' }
        ]}>
          <Text style={styles.messageAvatarText}>{msg.avatar}</Text>
        </View>

        <View style={[
          styles.messageBubble,
          msg.isUser ? styles.messageBubbleUser : styles.messageBubbleOther
        ]}>
          <Text style={[
            styles.messageText,
            msg.isUser && styles.messageTextUser
          ]}>
            {msg.content}
          </Text>
          <View style={styles.messageTimeContainer}>
            <Text style={[
              styles.messageTime,
              msg.isUser && styles.messageTimeUser
            ]}>
              {new Date(msg.time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {msg.isUser && <Text style={styles.messageCheckmark}>✓</Text>}
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.mainContainer}>
        {isSidebarOpen ? (
          // Sidebar View
          <View style={styles.sidebar}>
            <View style={styles.searchContainer}>
            
              {!selectedChat && (
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setIsSidebarOpen(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredConversations}
              renderItem={renderUserItem}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.userList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {searchKey.trim() ? 'No users found' : 'No conversations yet'}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {searchKey.trim() ? 'Try a different search term' : 'Search for users to start chatting'}
                  </Text>
                </View>
              }
            />

            <View style={styles.statusBar}>
              <Text style={styles.statusText}>
                Users: {allUsers.length} | Chats: {allChats.length}
              </Text>
              <View style={styles.connectionStatus}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: socketConnected ? '#10b981' : '#ef4444' }
                ]} />
                <Text style={styles.statusText}>
                  {socketConnected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              {connectionError && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Connection Error', connectionError);
                  }}
                >
                  <Text style={styles.errorText}>⚠️ Error</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          // Chat View
          <View style={styles.chatContainer}>
            {/* Header */}
            <View style={styles.chatHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setIsSidebarOpen(true)}
              >
                <Text style={styles.backButtonText}>‹</Text>
              </TouchableOpacity>
              <View style={styles.headerInfo}>
                {selectedChat ? (
                  <>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                      {getChatTitle(selectedChat)}
                    </Text>
                    <View style={styles.chatSubtitle}>
                      {selectedChat.members?.length === 2 ? (
                        (() => {
                          const otherMember = selectedChat.members?.find(m =>
                            (m._id || m.id) !== currentUser?.data?._id
                          );
                          const isOnline = otherMember ? isUserOnline(otherMember._id || otherMember.id) : false;
                          return (
                            <View style={styles.onlineStatus}>
                              <View style={[
                                styles.statusDot,
                                { backgroundColor: isOnline ? '#10b981' : '#9ca3af' }
                              ]} />
                              <Text style={styles.onlineStatusText}>
                                {isOnline ? 'Online' : 'Offline'}
                              </Text>
                            </View>
                          );
                        })()
                      ) : (
                        <Text style={styles.groupInfo}>
                          Group Chat • {selectedChat.members?.length || 0} members
                        </Text>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.chatTitle}>Select a conversation</Text>
                    <Text style={styles.chatSubtitleText}>
                      Choose from the list or search for users
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Messages */}
            <KeyboardAvoidingView
              style={styles.messagesContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
              {selectedChat ? (
                loadingMessages ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text style={styles.loadingText}>Loading messages...</Text>
                  </View>
                ) : (
                  <>
                    <FlatList
                      ref={flatListRef}
                      data={allMessages}
                      renderItem={renderMessage}
                      keyExtractor={(item) => item.id}
                      contentContainerStyle={styles.messagesList}
                      ListEmptyComponent={
                        <View style={styles.emptyMessagesContainer}>
                          <View style={styles.emptyMessagesIcon}>
                            <Text style={styles.emptyMessagesIconText}>✉</Text>
                          </View>
                          <Text style={styles.emptyMessagesTitle}>No messages yet</Text>
                          <Text style={styles.emptyMessagesSubtitle}>
                            Start the conversation below
                          </Text>
                        </View>
                      }
                      onContentSizeChange={() => scrollToBottom()}
                    />

                    {typingText && (
                      <View style={styles.typingContainer}>
                        <View style={styles.typingAvatar}>
                          <Text style={styles.typingAvatarText}>...</Text>
                        </View>
                        <View style={styles.typingBubble}>
                          <View style={styles.typingDots}>
                            <View style={[styles.typingDot, styles.typingDot1]} />
                            <View style={[styles.typingDot, styles.typingDot2]} />
                            <View style={[styles.typingDot, styles.typingDot3]} />
                          </View>
                          <Text style={styles.typingText}>{typingText}</Text>
                        </View>
                      </View>
                    )}
                  </>
                )
              ) : (
                <View style={styles.emptyMessagesContainer}>
                  <View style={styles.emptyMessagesIcon}>
                    <Text style={styles.emptyMessagesIconText}>✉</Text>
                  </View>
                  <Text style={styles.emptyMessagesTitle}>No conversation selected</Text>
                  <Text style={styles.emptyMessagesSubtitle}>
                    Choose a user from the sidebar to start messaging
                  </Text>
                </View>
              )}

              {/* Input Area */}
              {selectedChat && (
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textInput}
                    value={message}
                    onChangeText={(text) => {
                      setMessage(text);
                      handleTyping();
                    }}
                    placeholder={`Message ${getChatTitle(selectedChat)}...`}
                    placeholderTextColor="#9ca3af"
                    multiline
                    maxLength={1000}
                    editable={!sendingMessage}
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      (!message.trim() || sendingMessage) && styles.sendButtonDisabled
                    ]}
                    onPress={sendMessage}
                    disabled={!message.trim() || sendingMessage}
                  >
                    {sendingMessage ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.sendButtonText}>➤</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {!socketConnected && selectedChat && (
                <View style={styles.disconnectedBanner}>
                  <View style={styles.disconnectedDot} />
                  <Text style={styles.disconnectedText}>
                    {connectionError || 'Connection lost - Messages may not be delivered'}
                  </Text>
                </View>
              )}
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  mainContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 14,
  },
  sidebar: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 24,
    fontSize: 14,
    backgroundColor: '#f9fafb',
  },
  closeButton: {
    marginLeft: 12,
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6b7280',
  },
  userList: {
    flexGrow: 1,
  },
  userItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  userItemSelected: {
    backgroundColor: '#eff6ff',
    borderBottomColor: '#bfdbfe',
  },
  userItemContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  chatButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#10b981',
    borderRadius: 4,
    marginLeft: 8,
  },
  chatButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },
  lastMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  statusBar: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9ca3af',
  },
  chatContainer: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  backButtonText: {
    fontSize: 32,
    color: '#3b82f6',
    fontWeight: '300',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  chatSubtitle: {
    marginTop: 2,
  },
  chatSubtitleText: {
    fontSize: 14,
    color: '#6b7280',
  },
  onlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineStatusText: {
    fontSize: 14,
    color: '#6b7280',
  },
  groupInfo: {
    fontSize: 14,
    color: '#6b7280',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 16,
  },
  messageContainerUser: {
    alignItems: 'flex-end',
  },
  messageContainerOther: {
    alignItems: 'flex-start',
  },
  messageWrapper: {
    flexDirection: 'row',
    maxWidth: '80%',
  },
  messageWrapperReverse: {
    flexDirection: 'row-reverse',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  messageAvatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageBubbleUser: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#111827',
  },
  messageTextUser: {
    color: '#ffffff',
  },
  messageTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 10,
    color: '#9ca3af',
    opacity: 0.7,
  },
  messageTimeUser: {
    color: '#dbeafe',
  },
  messageCheckmark: {
    marginLeft: 4,
    fontSize: 10,
    color: '#dbeafe',
    opacity: 0.7,
  },
  emptyMessagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyMessagesIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyMessagesIconText: {
    fontSize: 32,
    color: '#9ca3af',
  },
  emptyMessagesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyMessagesSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 16,
    maxWidth: '80%',
  },
  typingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  typingAvatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9ca3af',
    marginHorizontal: 2,
  },
  typingDot1: {},
  typingDot2: {},
  typingDot3: {},
  typingText: {
    fontSize: 10,
    color: '#6b7280',
    opacity: 0.7,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 24,
    fontSize: 14,
    maxHeight: 120,
    backgroundColor: '#f9fafb',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 20,
    color: '#ffffff',
  },
  disconnectedBanner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fee2e2',
  },
  disconnectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  disconnectedText: {
    fontSize: 12,
    color: '#991b1b',
  },
});

export default ChatInterface;