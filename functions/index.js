const functions = require("firebase-functions");
const admin = require("firebase-admin");
const mail = require("@sendgrid/mail");

admin.initializeApp();
mail.setApiKey(
    "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"
);

const db = admin.firestore();
const rtdb = admin.database();


// Función personalizada para formato de fecha en español
const formatDateToSpanish = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

function obtenerFechaActual() {
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0'); // Obtener el día, y asegurarse de que tenga 2 dígitos
    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Obtener el mes (los meses van de 0 a 11 en JavaScript)
    const año = fecha.getFullYear(); // Obtener el año

    return `${dia}/${mes}/${año}`;
}

const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

// Función para enviar correo con ICS adjunto
const sendReminderEmail = async (email, subject, message, icsContent) => {
    const msg = {
        to: email,
        from: {
            email: 'info@unoin.do',
            name: 'Unidad Oncológica Integral'
        },
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

            const dayAfterAppointment = new Date(appointmentDate);
            dayAfterAppointment.setDate(appointmentDate.getDate() + 1);

            if (currentDate >= dayAfterAppointment) {
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


// Función para obtener el rango de fechas desde el lunes pasado hasta el lunes actual
const getDateRange = () => {
    const today = new Date();
    const currentMonday = new Date(today.setHours(0, 0, 0, 0));
    currentMonday.setDate(currentMonday.getDate() - currentMonday.getDay() + 1);

    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(previousMonday.getDate() - 7);

    return { previousMonday, currentMonday };
};

// Función para generar el contenido del PDF como HTML
const generatePDFContent = (ventas, previousMonday, currentMonday) => {
    let content = `
    <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #dddddd; text-align: left; padding: 8px; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            <h1>Unidad Oncológica Integral</h1>
            <h2>Reporte Semanal de Ventas</h2>
            <p>Fecha de Generación: ${obtenerFechaActual()}</p>
            <p>Rango de Fechas: ${formatDate(previousMonday)} - ${formatDate(currentMonday)}</p>
            <table>
                <tr>
                    <th>No.</th>
                    <th>Número Factura</th>
                    <th>Número Recibo</th>
                    <th>Paciente</th>
                    <th>Doctor</th>
                    <th>Total</th>
                    <th>Forma de Pago</th>
                    <th>Fecha</th>
                </tr>`;

    ventas.forEach((venta, index) => {
        content += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${venta.numeroFactura || 'N/A'}</td>
                    <td>${venta.numeroRecibo || 'N/A'}</td>
                    <td>${venta.paciente || 'N/A'}</td>
                    <td>${venta.doctor || 'N/A'}</td>
                    <td>${venta.totalPago || venta.total || '0'} DOP</td>
                    <td>${venta.formaDePago || 'N/A'}</td>
                    <td>${venta.fecha}</td>
                </tr>`;
    });

    content += `
            </table>
        </body>
    </html>`;
    return content;
};

// Función para enviar el reporte por correo
const sendPDFReport = async (email, htmlContent) => {
    const msg = {
        to: email,
        from: {
            email: 'info@unoin.do',
            name: 'Unidad Oncológica Integral'
        },
        subject: 'Reporte Semanal de Ventas',
        text: 'Adjunto se encuentra el reporte semanal de ventas.',
        html: htmlContent, // Enviar el HTML como contenido del correo
    };

    try {
        await mail.send(msg);
        console.log(`Correo enviado a: ${email}`);
    } catch (error) {
        console.error('Error enviando el correo:', error);
    }
};

// Función principal para generar y enviar el reporte semanal
exports.generateAndSendWeeklyReport = functions.pubsub.schedule('0 4 * * 1').onRun(async (context) => {
    const { previousMonday, currentMonday } = getDateRange();

    try {
        const facturasSnapshot = await db.collection('facturas')
            .where('estatus', '==', 'Cerrada')
            .get();

        const facturas = facturasSnapshot.docs
            .filter(doc => doc.ref.collection('pagos').size === 0)
            .map(doc => doc.data());

        const recibosSnapshot = await db.collection('recibos').get();
        const recibos = recibosSnapshot.docs.map(doc => doc.data());

        const ventas = [...facturas, ...recibos].filter(venta => {
            const ventaDate = new Date(venta.fecha.split('/').reverse().join('-'));
            return ventaDate >= previousMonday && ventaDate < currentMonday;
        });

        if (ventas.length === 0) {
            console.log('No hay ventas en el rango de fechas.');
            return;
        }

        const htmlContent = generatePDFContent(ventas, previousMonday, currentMonday);

        const usersSnapshot = await rtdb.ref('UsersAuthList').once('value');
        const admins = usersSnapshot.val();

        const adminEmails = Object.values(admins)
            .filter(user => user.roleselect === 'Administrador' || user.roleselect === 'Administrador Web')
            .map(user => user.email);

        await Promise.all(adminEmails.map(email => sendPDFReport(email, htmlContent)));

        console.log('Reporte semanal enviado correctamente.');
    } catch (error) {
        console.error('Error generando o enviando el reporte:', error);
    }
});