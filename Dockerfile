FROM node:18-alpine

# Set working directory to root project folder
WORKDIR /app

# Copy the entire project
COPY . .

# Build frontend with environment variables from Docker
WORKDIR /app/mcgill-chat-frontend

# Pass environment variables to create-react-app build
ENV REACT_APP_FIREBASE_API_KEY=${REACT_APP_FIREBASE_API_KEY}
ENV REACT_APP_FIREBASE_AUTH_DOMAIN=${REACT_APP_FIREBASE_AUTH_DOMAIN}
ENV REACT_APP_FIREBASE_PROJECT_ID=${REACT_APP_FIREBASE_PROJECT_ID}
ENV REACT_APP_FIREBASE_STORAGE_BUCKET=${REACT_APP_FIREBASE_STORAGE_BUCKET}
ENV REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${REACT_APP_FIREBASE_MESSAGING_SENDER_ID}
ENV REACT_APP_FIREBASE_APP_ID=${REACT_APP_FIREBASE_APP_ID}
ENV REACT_APP_SERVER_IP=${REACT_APP_SERVER_IP}

RUN npm install
RUN npm run build

# Copy build files to backend public folder
RUN mkdir -p /app/mcgill-chat-backend/public
RUN cp -r build/* /app/mcgill-chat-backend/public/

# Set up backend
WORKDIR /app/mcgill-chat-backend

# Create Firebase service account file
RUN echo '{ \
  "type": "service_account", \
  "project_id": "omcgill-36047", \
  "private_key_id": "245a8f1bba01149b627fecafc54da9ad4a70df59", \
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9dZEYNhtrvhu+\\nyBwpX9pjSuJ1cNlt2aTY/7cShxI0E58xJk3C5kFqGpYDUTJ3fNvZmpkcw13bln45\\nB5UfV+9t8kb/o6PCaAEu/9v8hV5ZbytWvkPAgqVAVPtkapfZ/GHQIWLInNT54q44\\nnj1MT3sb+LRs9bzkMlIezlQbt3VEmKd9vxazNW0lv9azrxaYuM5iCGms5LO4uFTZ\\nNua1bKsDkZwJKoC49qIBVckd+aHazIcBwuIIGU0HFizNMPx83Q9rqnRLN/78v06u\\nGvj76YneTdpLqaGdX5Fmsckjfweefj1gTXHYPKO9gH4onEaSzSS5UDz4xN6gvt06\\nIfLM2AhJAgMBAAECggEAQXNqlysmCPAppJx8Ah0flHrLxhegva7ZILAini90bfIz\\nZibd6U1jXtTlayrzXM0RJFkguQuTEqeoXmpMrYHS8LAor+rnyWLlucdhR5kJcasS\\nlUpwnIJltVZGbLfYUtG6Ns0506U+fD8/wcaE1aaFmLGwHw473be2n/bWnqafx/y9\\nOarXFuTk4ozPHscLdGXczEiDi+RFTzws6WWCtBiDM2dbxeTWRjmy3jsifxcNyVI7\\n8H+A9MYuBMWV24f4NF3EmRmJX4zm720RyPxJcZiTtaoxAN3FEj/DpKOc8NVF5J99\\nKskQA1x9h+qTmBqxvwMljHPSWN0PocYYrxcsfUbnCwKBgQD6vLrkWqOfCoN/D4eb\\noBSAzS6KjsqwsTdo6GInebNiyul3hi5xmqoC66MgAhh5i7tUjfXK1im9+qrMnT4b\\nJKqKwheWTBZuVL6VxCx+IoT6EWR0F/FOVdRB/8IpAysbMT1dks2v0P4Y76nnoXyY\\n0uj8ZY6ueCOqSGOjTbPQRArANwKBgQDBb5Nkt35R11nVzj+7SvFwOCVMRzAzK2X8\\nfl6TGxmiAE6NzRoT46er3kl9cZfMRRgRouVpsGTFcTRo/RXcqksZtCZoupy5Ee2n\\n8l8d978mvLQ5sNHIu4SeFvxcs8VawfZhGk/NA5p1nB0dya4d6KHXHL+Hft3oNc4B\\nfjWjQXo7fwKBgQCSHU9P6V32PVs5vSQKVbP9BxS7G9EUPIGMufcRCAO4a4S36VLB\\nUx8Fyqlp6q62je4hrQRyKnFyy1OjH3LkwG49pDO4myhrLSlO/13qN1WEoIQIfzdY\\nrf2eZFuSKM2C8CPRls4USdb5UxiQ6fNA3490Hf6Sv2IRRlQCAzLpB+236wKBgCNE\\noZ4SaqCnYATAhxQx9NVeF0bSD/K0bfLcY4f0v/aukaP/CksoDdEjRUju5htjWaEV\\njzh25dit7D1cL5k9H1Y/Z2Ve6OZBY5Bke30uR5bbfwyptYYg0mw0iqyoRkpm5PIN\\nZxFdH9NjtFdTB0ECwkdDQZSFyBXngXj6NvNeI9gnAoGAfzHZum5RryqxqrVtZ8gm\\n9BGpWE79qLi0/bbA+7T+t7YJAqc2sO9wO1DPTaoDXRxND2/xIgdf23ueiyf4Jh2X\\n/2OJo/ktZxlDFWgXgj/343ggsCLtDrkzPvrmUIdvDBqpwTSE1mmoYgc/9zcz+nhw\\nMgzirhWTcKl/fOPq6V+ZLko=\\n-----END PRIVATE KEY-----\\n", \
  "client_email": "firebase-adminsdk-fbsvc@omcgill-36047.iam.gserviceaccount.com", \
  "client_id": "100549285943914217172", \
  "auth_uri": "https://accounts.google.com/o/oauth2/auth", \
  "token_uri": "https://oauth2.googleapis.com/token", \
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", \
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40omcgill-36047.iam.gserviceaccount.com", \
  "universe_domain": "googleapis.com" \
}' > serviceAccountKey.json

RUN npm install --only=production

# Create directories for SSL certificates
RUN mkdir -p ./.cert

# Expose ports for HTTP and HTTPS
EXPOSE 5001 443

# Start the backend server
CMD ["node", "server.js"]