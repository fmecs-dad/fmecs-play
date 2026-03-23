require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Initialiser Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configurer le transporteur email (ex: Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Fonction pour vérifier l'utilisation du stockage
async function checkStorageUsage() {
  try {
    // Récupérer les métriques de stockage (remplace "bucket_name" par le nom de ton bucket)
    const { data: files, error } = await supabase.storage.from('avatars').list('', { limit: 1 });
    if (error) throw error;

    // Calculer la taille totale utilisée (simplifié - à adapter selon ton bucket)
    const { data: bucketSize } = await supabase.rpc('get_bucket_size', { bucket_name: 'avatars' });
    const usedMB = bucketSize / (1024 * 1024); // Convertir en Mo

    console.log(`Utilisation actuelle du stockage : ${usedMB.toFixed(2)} Mo`);

    // Vérifier si le seuil de 800 Mo est dépassé
    if (usedMB > 800) {
      console.log('Seuil dépassé ! Envoi d\'un email d\'alerte...');
      await sendAlertEmail(usedMB);
    } else {
      console.log('Tout est normal.');
    }
  } catch (err) {
    console.error('Erreur:', err.message);
  }
}

// Fonction pour envoyer un email d'alerte
async function sendAlertEmail(usedMB) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: '⚠️ Alerte : Stockage Supabase presque plein !',
    text: `Le stockage Supabase a dépassé 800 Mo. Utilisation actuelle : ${usedMB.toFixed(2)} Mo.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email d\'alerte envoyé avec succès !');
  } catch (err) {
    console.error('Erreur lors de l\'envoi de l\'email:', err.message);
  }
}

// Exécuter la vérification
checkStorageUsage();
