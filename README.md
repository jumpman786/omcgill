# McGill Chat

A personal project showcasing a real-time chat application built with React frontend and Node.js backend, featuring Socket.IO for instant messaging, MongoDB for data persistence, and Firebase integration.

## 🚀 Features

- **Real-time messaging** with Socket.IO
- **User authentication** with JWT tokens
- **Firebase integration** for additional services
- **MongoDB database** for data persistence
- **CORS-enabled** for cross-origin requests
- **HTTPS support** for secure connections
- **Responsive design** with React

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [MongoDB](https://www.mongodb.com/) (running locally or MongoDB Atlas)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/mcgill-chat.git
cd mcgill-chat
```

### 2. Install backend dependencies
```bash
cd mcgill-chat-backend
npm install
```

### 3. Install frontend dependencies
```bash
cd ../mcgill-chat-frontend
npm install
```

## ⚙️ Configuration

### Backend Environment Variables

Create a `.env` file in the `mcgill-chat-backend` directory with the following variables:

```env
# Server Configuration
PORT=5001
HTTPS_PORT=443
HOST=0.0.0.0

# Security
CORS_ORIGINS=https://localhost:3000,https://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3000
SESSION_SECRET=your_session_secret_here
JWT_SECRET=your_jwt_secret_here

# Database
MONGODB_URI=mongodb://localhost:27017/mcgill-chat
```

### Frontend Configuration

The frontend is configured to work with the backend on port 5001 by default. If you need to change the backend URL, update the axios configuration in your frontend components.

## 🚀 Running the Application

### Start the Backend Server
```bash
cd mcgill-chat-backend
npm start
```
The backend server will start on `http://localhost:5001`

### Start the Frontend Development Server
```bash
cd mcgill-chat-frontend
npm start
```
The frontend will start on `http://localhost:3000` and automatically open in your browser.

## 📡 API Endpoints

The backend provides RESTful API endpoints and Socket.IO connections:

- **HTTP Server**: `http://localhost:5001`
- **HTTPS Server**: `https://localhost:443` (if configured)
- **Socket.IO**: Real-time communication on the same ports

## 🔧 Socket.IO Configuration

The application uses Socket.IO with the following settings:
- **Ping Timeout**: 60 seconds
- **Ping Interval**: 25 seconds
- **Max Buffer Size**: 100MB
- **Transports**: WebSocket and polling
- **CORS**: Enabled for development

## 🗄️ Database

The application uses MongoDB with the following default configuration:
- **Database Name**: `mcgill-chat`
- **Connection**: `mongodb://localhost:27017/mcgill-chat`
- **Options**: New URL parser and unified topology enabled

## 🔐 Security Features

- **CORS Protection**: Configurable allowed origins
- **JWT Authentication**: Secure token-based authentication
- **Session Management**: Express sessions with custom secrets
- **HTTPS Support**: Ready for production deployment

## 🧪 Testing

Run tests for the frontend:
```bash
cd mcgill-chat-frontend
npm test
```

## 📦 Building for Production

### Build the Frontend
```bash
cd mcgill-chat-frontend
npm run build
```

This creates a `build` folder with optimized production files.

### Backend Production
Make sure to set proper environment variables for production:
- Use strong, unique secrets for `SESSION_SECRET` and `JWT_SECRET`
- Configure proper `CORS_ORIGINS` for your domain
- Use MongoDB Atlas or a production MongoDB instance
- Set up HTTPS certificates for secure connections

## 🚀 Deployment

### Frontend Deployment
The built frontend can be deployed to any static hosting service:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront

### Backend Deployment
The backend can be deployed to:
- Heroku
- AWS EC2
- DigitalOcean
- Railway
- Render

Make sure to:
1. Set all environment variables in your hosting platform
2. Configure your database connection string
3. Update CORS origins to include your production domain
4. Set up SSL certificates for HTTPS

## 📁 Project Structure

```
mcgill-chat/
├── mcgill-chat-backend/
│   ├── config.js
│   ├── package.json
│   └── [other backend files]
└── mcgill-chat-frontend/
    ├── package.json
    ├── public/
    ├── src/
    └── [other frontend files]
```

## 🤝 Contributing

This is a personal project, but feel free to:
- Fork the repository and experiment with your own features
- Submit issues or suggestions
- Use this code as a reference for your own chat applications

If you'd like to contribute directly:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**MongoDB Connection Error**
- Ensure MongoDB is running locally or check your connection string
- Verify network connectivity for MongoDB Atlas

**CORS Errors**
- Check that your frontend URL is included in `CORS_ORIGINS`
- Verify the backend server is running on the expected port

**Socket.IO Connection Issues**
- Check firewall settings for the configured ports
- Ensure both HTTP and WebSocket traffic is allowed

**Build Errors**
- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version compatibility

## 📞 Support

This is a personal learning project! If you have questions about the implementation or run into issues while exploring the code, feel free to open an issue.

---

**Thanks for checking out my project! 💬**
