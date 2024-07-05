const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mail = require("@sendgrid/mail");

admin.initializeApp();
mail.setApiKey(
    "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",
);

const db = admin.firestore();

const sendReminderEmail = async (email, subject, message) => {
    const msg = {
        to: email,
        from: 'info@unoin.do',
        subject: subject,
        text: message,
    };

    try {
        await mail.send(msg);
        console.log('Reminder email sent successfully');
    } catch (error) {
        console.error('Error sending reminder email:', error);
    }
};

const formatDateToSpanish = (date) => {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
};

exports.sendAppointmentReminders = functions.pubsub.schedule('0 4 * * *').onRun(async (context) => {
    const currentDate = new Date();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(currentDate.getDate() + 1);
    const tomorrowFormatted = formatDateToSpanish(tomorrowDate);

    try {
        const snapshot = await db.collection('CitasAgendas').get();
        snapshot.forEach(async (doc) => {
            const appointment = doc.data();
            if (appointment.fechaEntrada === tomorrowFormatted) {
                const email = appointment.email;
                const subject = 'RECORDATORIO DE CITA MÉDICA- UNOIN';
                const message = `Estimado(a) Sr(a) ${appointment.paciente},\n\nEste es un recordatorio de su cita médica con su especialista ${appointment.doctor} programada para el ${appointment.fechaEntrada} a las ${appointment.hora}.\n\nUnidad Oncológica Integral\nCalle Arístides Fiallo Cabral #51, Gazcue. Santo Domingo\nTeléfono (809) 530-1057`;
                await sendReminderEmail(email, subject, message);
            }
        });
        console.log('Appointment reminder emails sent successfully');
    } catch (error) {
        console.error('Error fetching appointments:', error);
    }
});