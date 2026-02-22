require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Configuration de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());

// Route pour vérifier le mot de passe actuel
app.post('/api/verify-password', async (req, res) => {
  const { email, currentPassword } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Non autorisé' });
  }

  try {
    // Vérifier le token et obtenir l'utilisateur
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;

    // Vérifier le mot de passe actuel
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: currentPassword,
    });

    if (signInError) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
    }

    res.status(200).json({ message: 'Mot de passe actuel vérifié avec succès.' });

  } catch (err) {
    console.error("Erreur lors de la vérification du mot de passe:", err);
    res.status(500).json({ message: err.message || "Erreur lors de la vérification du mot de passe." });
  }
});

// Route pour changer le mot de passe
app.post('/api/change-password', async (req, res) => {
  const { newPassword } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Non autorisé' });
  }

  try {
    // Mettre à jour le mot de passe
    const { error: updateError } = await supabase.auth.api.updateUser(token, {
      password: newPassword
    });

    if (updateError) throw updateError;

    res.status(200).json({ message: 'Mot de passe changé avec succès.' });

  } catch (err) {
    console.error("Erreur lors du changement de mot de passe:", err);
    res.status(500).json({ message: err.message || "Erreur lors du changement de mot de passe." });
  }
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
