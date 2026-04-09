const { execSync } = require('child_process');

try {
  console.log("Installing Capacitor core & Android...");
  execSync('npm i @capacitor/core @capacitor/android', { stdio: 'inherit' });
  
  console.log("Installing Capacitor CLI...");
  execSync('npm i -D @capacitor/cli', { stdio: 'inherit' });
  
  console.log("Initializing Capacitor...");
  execSync('npx cap init CASEO com.pallavi.caseo --web-dir dist', { stdio: 'inherit' });
  
  console.log("Building Vite App...");
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log("Adding Android platform...");
  execSync('npx cap add android', { stdio: 'inherit' });
  
  console.log("Done! Capacitor and Android platform are ready.");
} catch (error) {
  console.error("Setup failed: ", error.message);
}
