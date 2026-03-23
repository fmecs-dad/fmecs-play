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

async function checkStorageUsage() {
  try {
    // Lister tous les fichiers du bucket "avatars"
    const { data: files, error } = await supabase.storage.from('avatars').list('', { limit: 1000 });

    if (error) throw error;

    // Calculer la taille totale en sommant la taille de chaque fichier
    let totalSizeBytes = 0;
    files.forEach(file => {
      if (file.metadata && file.metadata.size) {
        totalSizeBytes += parseInt(file.metadata.size);
      }
    });

    const totalSizeMB = totalSizeBytes / (1024 * 1024); // Convertir en Mo
    console.log(`Utilisation actuelle du stockage : ${totalSizeMB.toFixed(2)} Mo`);

    if (totalSizeMB > 800) {
      console.log('Seuil dépassé ! Envoi d\'un email d\'alerte...');
      await sendAlertEmail(totalSizeMB);
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

// Fonction nettoyage base avatars
async function cleanUnusedAvatars() {
  try {
    // Récupérer les noms des avatars actifs
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('avatar_url')
      .not('avatar_url', 'is', null);

    if (playersError) throw playersError;

    const activeAvatarNames = players.map(player =>
      player.avatar_url.replace('https://gjzqghhqpycbcwykxvgw.supabase.co/storage/v1/object/public/avatars/', '')
    );

    // Lister tous les objets du bucket "avatars"
    const { data: allObjects, error: listError } = await supabase.storage.from('avatars').list('', { limit: 100 });

    if (listError) throw listError;

    // Filtrer les objets à supprimer (ceux non présents dans activeAvatarNames)
    const objectsToDelete = allObjects.filter(obj => !activeAvatarNames.includes(obj.name));

    // Supprimer les objets inutilisés
    for (const obj of objectsToDelete) {
      const { error: deleteError } = await supabase.storage.from('avatars').remove([obj.name]);
      if (deleteError) throw deleteError;
      console.log(`Suppression de l'avatar inutilisé : ${obj.name}`);
    }

    console.log('Nettoyage des avatars inutilisés terminé.');
  } catch (err) {
    console.error('Erreur lors du nettoyage :', err.message);
  }
}
// Exécuter la vérification
checkStorageUsage();
