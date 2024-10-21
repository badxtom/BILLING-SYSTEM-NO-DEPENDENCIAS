const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mail = require("@sendgrid/mail");

admin.initializeApp();
mail.setApiKey(
    "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"
);

const db = admin.firestore();

// Función personalizada para formato de fecha en español
const formatDateToSpanish = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Función para enviar correo con ICS adjunto
const sendReminderEmail = async (email, subject, message, icsContent) => {
    const msg = {
        to: email,
        from: 'info@unoin.do',
        subject: subject,
        text: message,
        attachments: [
            {
                content: Buffer.from(icsContent).toString('base64'),
                filename: 'cita.ics',
                type: 'text/calendar',
                disposition: 'attachment',
            },
        ],
    };

    try {
        await mail.send(msg);
        console.log(`Correo enviado a: ${email}`);
    } catch (error) {
        console.error('Error enviando el correo:', error);
    }
};

// Función para crear el contenido del archivo ICS
const generateICS = (appointment) => {
    const [day, month, year] = appointment.fecha.split('/');
    const [hour, minute] = appointment.hora.split(':');

    const startDate = new Date(year, month - 1, day, hour, minute);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1); // Evento de 1 hora

    // Formatear las fechas en formato ICS compatible
    const formatICSDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hour}${minute}${second}`;
    };

    return `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//UNOIN//Cita Médica//ES
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${Date.now()}
DTSTAMP:${formatICSDate(new Date())}Z
DTSTART;TZID=America/Santo_Domingo:${formatICSDate(startDate)}
DTEND;TZID=America/Santo_Domingo:${formatICSDate(endDate)}
SUMMARY:Cita Médica
DESCRIPTION:Cita con su especialista ${appointment.doctor} el ${appointment.fecha} a las ${appointment.hora}.
LOCATION:Unidad Oncológica Integral, Santo Domingo
ORGANIZER;CN=Unidad Oncológica Integral:mailto:info@unoin.do
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR
    `.trim();
};


// Programar la función para enviar recordatorios
exports.sendAppointmentReminders = functions.pubsub.schedule('0 4 * * *').onRun(async (context) => {
    const currentDate = new Date();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(currentDate.getDate() + 1);
    const tomorrowFormatted = formatDateToSpanish(tomorrowDate);

    try {
        const snapshot = await db.collection('CitasAgendas').get();
        const batch = db.batch();

        snapshot.forEach(async (doc) => {
            const appointment = doc.data();
            const appointmentDateParts = appointment.fecha.split('/');
            const appointmentDate = new Date(`${appointmentDateParts[2]}-${appointmentDateParts[1]}-${appointmentDateParts[0]}`);

            if (appointment.fecha === tomorrowFormatted) {
                const email = appointment.email;
                const subject = 'RECORDATORIO DE CITA MÉDICA- UNOIN';
                const message = `Estimado(a) Sr(a) ${appointment.paciente},\n\nEste es un recordatorio de su cita médica con su especialista ${appointment.doctor} programada para el ${appointment.fecha} a las ${appointment.hora}.\n\nUnidad Oncológica Integral\nCalle Arístides Fiallo Cabral #51, Gazcue. Santo Domingo\nTeléfono (809) 530-1057`;
                const icsContent = generateICS(appointment);
                await sendReminderEmail(email, subject, message, icsContent);
            }


            if (appointmentDate < currentDate) {
                const historialRef = db.collection('HistorialCitasAgendas').doc(doc.id);
                batch.set(historialRef, appointment);
                batch.delete(doc.ref);
            }
        });

        await batch.commit();
        console.log('Appointment reminder emails sent and past appointments archived successfully');
    } catch (error) {
        console.error('Error processing appointments:', error);
    }

});
