<?php
$to = "ty.szeto1@gmail.com";
$subject = "Mail Test";
$message = "This is a test email to verify mail server configuration.";
$headers = "From: webmaster@yourdomain.com";

if(mail($to, $subject, $message, $headers)) {
    echo "Test email sent successfully!";
} else {
    echo "Failed to send test email.";
}
?>