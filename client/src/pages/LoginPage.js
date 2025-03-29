import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../firebase-config";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { 
  Button, 
  CircularProgress, 
  Typography, 
  Paper, 
  Box,
  Alert
} from "@mui/material";

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      await fetch('http://localhost:5000/api/auth/store-tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await result.user.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: credential.accessToken
        })
      });

      navigate("/editor");
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      p: 2
    }}>
      <Paper elevation={3} sx={{
        width: '100%',
        maxWidth: 400,
        p: 4,
        textAlign: 'center'
      }}>
        <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
          Letter Editor
        </Typography>
        
        <Typography variant="body1" sx={{ mb: 3 }}>
          Sign in to save letters to your Google Drive
        </Typography>

        <Button
          variant="contained"
          onClick={handleSignIn}
          disabled={isLoading}
          fullWidth
          sx={{
            py: 1.5,
            mb: 2
          }}
        >
          {isLoading ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Sign in with Google'
          )}
        </Button>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>
    </Box>
  );
}