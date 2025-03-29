import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button, TextField, Box, Alert } from "@mui/material";

export default function EditorPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [driveLink, setDriveLink] = useState(null);

  const handleSave = async () => {
    if (!user || !title.trim()) {
      setError("Please add a title and ensure you're logged in");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      
      const response = await fetch("http://localhost:5000/api/letters", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          title: title.trim(),
          content: content.trim(),
          userEmail: user.email
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to save");
      
      setDriveLink(result.driveLink);
      setTitle("");
      setContent("");
    } catch (error) {
      setError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <h2>Create New Letter</h2>
      
      <TextField
        label="Letter Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        fullWidth
        sx={{ mb: 3 }}
        required
      />
      
      <TextField
        label="Letter Content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        fullWidth
        multiline
        rows={10}
        sx={{ mb: 3 }}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {driveLink && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Saved! <a href={driveLink} target="_blank" rel="noopener">Open in Drive</a>
        </Alert>
      )}

      <Button
        variant="contained"
        onClick={handleSave}
        disabled={isSaving || !title.trim()}
      >
        {isSaving ? "Saving..." : "Save to Drive"}
      </Button>
    </Box>
  );
}