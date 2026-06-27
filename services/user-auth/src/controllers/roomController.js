import prisma from '../lib/prisma.js';

export const createRoom = async (req, res) => {
  try {
    const { roomName } = req.body;
    if (!roomName) {
      return res.status(400).json({ message: 'roomName is required' });
    }

    const room = await prisma.room.create({
      data: {
        roomName,
        hostId: req.user.userId,
      },
    });

    return res.status(201).json({ message: 'Room created successfully', room });
  } catch (error) {
    return res.status(500).json({ message: 'Room creation failed', error: error.message });
  }
};

export const getRooms = async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      include: { host: { select: { id: true, email: true, username: true } } },
    });
    return res.status(200).json({ rooms });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch rooms', error: error.message });
  }
};

export const getRoomById = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await prisma.room.findUnique({
      where: { id },
      include: { host: { select: { id: true, email: true, username: true } } },
    });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    return res.status(200).json({ room });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch room', error: error.message });
  }
};
