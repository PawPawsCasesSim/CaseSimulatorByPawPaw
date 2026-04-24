// Замените на свои данные из консоли Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAGCiEd7h4p4SLenN_PCHd2ji8NFoQ2zNI",
  authDomain: "pawpawcasesimulator.firebaseapp.com",
  projectId: "pawpawcasesimulator",
  storageBucket: "pawpawcasesimulator.firebasestorage.app",
  messagingSenderId: "261385601567",
  appId: "1:261385601567:web:eb64aeb22b6a0326670b2a"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
