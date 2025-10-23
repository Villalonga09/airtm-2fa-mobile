// Mobile Scan Page JavaScript - Airtm 2FA Extension
// Handles QR scanning and account data submission

// Supabase Configuration
const SUPABASE_URL = "https://qarbaolagobqjjnlerzy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmJhb2xhZ29icWpqbmxlcnp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExNjMyNDgsImV4cCI6MjA3NjczOTI0OH0.IVwq3mWn3Rtt5QV0MZRZfMdB4I46ooknBSwiPxuTc5w";

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const formState = document.getElementById('formState');
const successState = document.getElementById('successState');
const retryBtn = document.getElementById('retryBtn');
const closeBtn = document.getElementById('closeBtn');
const scanQRBtn = document.getElementById('scanQRBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const cameraView = document.getElementById('cameraView');

let sessionId = null;
let html5QrCode = null;
let isScanning = false;

const supabaseHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

// Obtener sessionId de la URL
function getSessionIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('session');
}

// Mostrar estado
function showState(state) {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  formState.classList.add('hidden');
  successState.classList.add('hidden');

  switch (state) {
    case 'loading':
      loadingState.classList.remove('hidden');
      break;
    case 'error':
      errorState.classList.remove('hidden');
      break;
    case 'form':
      formState.classList.remove('hidden');
      break;
    case 'success':
      successState.classList.remove('hidden');
      break;
  }
}

// Verificar si la sesión existe y es válida
async function verifySession(sessionId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/qr_sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
      { headers: supabaseHeaders }
    );

    if (!response.ok) {
      return { valid: false, reason: 'Network error' };
    }

    const sessions = await response.json();
    const sessionData = sessions[0];

    if (!sessionData) {
      return { valid: false, reason: 'Session not found' };
    }

    const now = Date.now();

    // Verificar si la sesión ha expirado
    if (sessionData.expires_at && new Date(sessionData.expires_at).getTime() < now) {
      return { valid: false, reason: 'Session expired' };
    }

    // Verificar si la sesión ya fue completada
    if (sessionData.status === 'completed') {
      return { valid: false, reason: 'Session already completed' };
    }

    return { valid: true, sessionData };
  } catch (error) {
    console.error('Error verifying session:', error);
    return { valid: false, reason: 'Verification error' };
  }
}

// Validar clave secreta Base32
function validateBase32Secret(secret) {
  const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
  const base32Regex = /^[A-Z2-7]+=*$/;
  return base32Regex.test(cleanSecret) && cleanSecret.length >= 8;
}

// Parsear URI TOTP
function parseTOTPUri(uri) {
  try {
    // Formato: otpauth://totp/Label?secret=SECRET&issuer=Issuer
    const url = new URL(uri);
    
    if (url.protocol !== 'otpauth:' || url.host !== 'totp') {
      return null;
    }

    const secret = url.searchParams.get('secret');
    const issuer = url.searchParams.get('issuer');
    const label = decodeURIComponent(url.pathname.substring(1));

    if (!secret) {
      return null;
    }

    // Extraer nombre de la cuenta del label
    let accountName = label;
    if (label.includes(':')) {
      accountName = label.split(':')[1] || label;
    }

    // Si hay issuer, usarlo como prefijo
    if (issuer && !accountName.toLowerCase().includes(issuer.toLowerCase())) {
      accountName = `${issuer} - ${accountName}`;
    }

    return {
      label: accountName,
      secret: secret.replace(/\s+/g, '').toUpperCase()
    };
  } catch (error) {
    console.error('Error parsing TOTP URI:', error);
    return null;
  }
}

// Iniciar escáner de QR
async function startQRScanner() {
  if (isScanning) return;

  try {
    // Mostrar vista de cámara
    cameraView.classList.remove('hidden');
    scanQRBtn.disabled = true;
    
    // Evitar scroll en el body
    document.body.classList.add('camera-active');

    // Inicializar escáner
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("qrReader");
    }

    isScanning = true;

    // Configuración mejorada del escáner
    const config = {
      fps: 20, // Aumentado para mejor detección
      qrbox: function(viewfinderWidth, viewfinderHeight) {
        // Caja de escaneo adaptativa
        let minEdgePercentage = 0.7; // 70% del tamaño de la vista
        let minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
        let qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
        return {
          width: qrboxSize,
          height: qrboxSize
        };
      },
      aspectRatio: 1.0,
      // Formatos soportados
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      // Configuración avanzada
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      // Mostrar indicador de escaneo
      showTorchButtonIfSupported: true,
      // Configuración de video
      videoConstraints: {
        facingMode: "environment",
        advanced: [{ zoom: 1.0 }]
      }
    };

    await html5QrCode.start(
      { facingMode: "environment" }, // Cámara trasera
      config,
      onScanSuccess,
      onScanError
    );

    console.log('QR Scanner started with improved config');
  } catch (error) {
    console.error('Error starting QR scanner:', error);
    showCustomAlert(
      'Error de cámara',
      'No se pudo acceder a la cámara. Por favor, verifica los permisos en la configuración de tu navegador.',
      'Entendido'
    );
    stopQRScanner();
  }
}

// Detener escáner de QR
async function stopQRScanner() {
  if (!isScanning || !html5QrCode) return;

  try {
    await html5QrCode.stop();
    isScanning = false;
    cameraView.classList.add('hidden');
    scanQRBtn.disabled = false;
    
    // Restaurar scroll en el body
    document.body.classList.remove('camera-active');
    
    console.log('QR Scanner stopped');
  } catch (error) {
    console.error('Error stopping QR scanner:', error);
  }
}

// Callback cuando se escanea un QR exitosamente
async function onScanSuccess(decodedText, decodedResult) {
  console.log('QR Code detected:', decodedText);
  console.log('QR Result:', decodedResult);

  // Parsear URI TOTP primero para validar
  const totpData = parseTOTPUri(decodedText);

  if (!totpData) {
    // No es un código TOTP válido, mostrar error pero NO detener escáner
    console.warn('Invalid TOTP QR, continuing scan...');
    showCustomAlert(
      'Código QR no válido',
      'Debe ser un código TOTP que empiece con: otpauth://totp/\n\nContenido detectado: ' + decodedText.substring(0, 50) + '...',
      'Entendido'
    );
    return; // Continuar escaneando
  }

  // Es un código TOTP válido, detener escáner
  await stopQRScanner();

  // Vibración de éxito
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]); // Patrón de vibración
  }

  // Mostrar estado de carga
  showState('loading');

  // Enviar datos automáticamente
  const accountData = {
    label: totpData.label,
    secret: totpData.secret,
    timestamp: Date.now()
  };

  const success = await submitAccountData(accountData);

  if (success) {
    // Mostrar estado de éxito
    showState('success');
  } else {
    // Error al enviar, mostrar formulario con datos prellenados
    accountNameInput.value = totpData.label;
    secretKeyInput.value = totpData.secret;
    showState('form');
    
    showCustomAlert(
      'Error al agregar cuenta',
      'No se pudo agregar la cuenta automáticamente. Puedes intentar enviarla manualmente.',
      'Entendido'
    );
  }
}

// Callback para errores de escaneo (se llama continuamente)
function onScanError(errorMessage) {
  // No hacer nada, es normal que haya "errores" mientras busca el QR
  // Solo logear errores importantes
  if (errorMessage && !errorMessage.includes('NotFoundException')) {
    console.debug('Scan error:', errorMessage);
  }
}

// Enviar datos de la cuenta a Supabase
async function submitAccountData(accountData) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/qr_sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders,
        body: JSON.stringify({
          status: 'completed',
          account_data: accountData
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('Account data submitted successfully');
    return true;
  } catch (error) {
    console.error('Error submitting account data:', error);
    return false;
  }
}

// Event Listeners

// Botón de escanear QR
scanQRBtn.addEventListener('click', startQRScanner);

// Botón de cerrar cámara
closeCameraBtn.addEventListener('click', stopQRScanner);

// Botón de ingreso manual
const btnManualScan = document.getElementById('btnManualScan');
if (btnManualScan) {
  btnManualScan.addEventListener('click', async () => {
    // Detener escáner
    await stopQRScanner();
    
    // Mostrar alerta personalizada para ingreso manual
    showCustomAlert(
      'Ingreso Manual',
      'Esta función permite ingresar manualmente los datos de la cuenta 2FA.\n\nPor ahora, usa el escáner QR para agregar cuentas automáticamente.',
      'Entendido'
    );
  });
}

// Botón de reintentar
retryBtn.addEventListener('click', () => {
  window.location.reload();
});

// Botón de cerrar
closeBtn.addEventListener('click', () => {
  window.close();
});

// Limpiar al salir
window.addEventListener('beforeunload', () => {
  if (isScanning) {
    stopQRScanner();
  }
  // Asegurar que se remueva la clase
  document.body.classList.remove('camera-active');
});

// Prevenir scroll cuando la cámara está activa
document.addEventListener('touchmove', (e) => {
  if (document.body.classList.contains('camera-active')) {
    e.preventDefault();
  }
}, { passive: false });

// Custom Alert Function (sin emojis, más profesional)
function showCustomAlert(title, message, buttonText = 'Aceptar') {
  return new Promise((resolve) => {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'custom-alert-overlay';
    alertDiv.innerHTML = `
      <div class="custom-alert-box">
        <div class="custom-alert-header">
          <h3 class="custom-alert-title">${title}</h3>
        </div>
        <div class="custom-alert-body">
          <p class="custom-alert-message">${message}</p>
        </div>
        <div class="custom-alert-footer">
          <button class="custom-alert-btn">${buttonText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    const btn = alertDiv.querySelector('.custom-alert-btn');
    btn.addEventListener('click', () => {
      document.body.removeChild(alertDiv);
      resolve();
    });
    
    // Cerrar al hacer clic fuera
    alertDiv.addEventListener('click', (e) => {
      if (e.target === alertDiv) {
        document.body.removeChild(alertDiv);
        resolve();
      }
    });
  });
}

// Inicializar aplicación
async function init() {
  showState('loading');

  // Obtener sessionId de la URL
  sessionId = getSessionIdFromURL();

  if (!sessionId) {
    console.error('No session ID provided');
    showState('error');
    return;
  }

  console.log('Session ID:', sessionId);

  // Verificar sesión
  const verification = await verifySession(sessionId);

  if (!verification.valid) {
    console.error('Invalid session:', verification.reason);
    showState('error');
    return;
  }

  // Mostrar formulario (solo botón de escanear)
  showState('form');
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
