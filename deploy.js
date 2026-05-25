// api/deploy.js
export default async function handler(req, res) {
  // Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { files, projectName } = req.body;

    if (!files || !Array.isArray(files) || !projectName) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Token diambil dari environment variable VERCEL_API_TOKEN
    const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
    if (!VERCEL_TOKEN) {
      return res.status(500).json({ error: 'Server configuration error: missing token' });
    }

    // Format file untuk Vercel API
    const vercelFiles = files.map(file => ({
      file: file.name,
      data: file.data,  // base64 tanpa prefix
    }));

    // Kirim deployment ke Vercel
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        files: vercelFiles,
        projectSettings: {
          framework: null,
          buildCommand: '',
          outputDirectory: '',
          installCommand: '',
        },
        target: 'production',
      }),
    });

    if (!deployRes.ok) {
      const errData = await deployRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Deployment failed (${deployRes.status})`);
    }

    const deployData = await deployRes.json();

    // Polling hingga deployment siap
    let url = `https://${projectName}.vercel.app`;
    if (deployData.id) {
      const checkUrl = `https://api.vercel.com/v13/deployments/${deployData.id}`;
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        const checkRes = await fetch(checkUrl, {
          headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` },
        });
        const checkData = await checkRes.json();
        if (checkData.readyState === 'READY' && checkData.alias && checkData.alias.length > 0) {
          url = 'https://' + checkData.alias[0];
          break;
        }
        if (checkData.readyState === 'ERROR') {
          throw new Error('Deployment error: ' + (checkData.errorMessage || ''));
        }
      }
    }

    return res.status(200).json({ success: true, url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}