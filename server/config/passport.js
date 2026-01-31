const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id).then((user) => {
        done(null, user);
    });
});

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_REDIRECT_URI,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user already exists
                let existingUser = await User.findOne({ googleId: profile.id });
                if (existingUser) {
                    // Update tokens
                    existingUser.accessToken = accessToken;
                    if (refreshToken) existingUser.refreshToken = refreshToken; // Refresh token might not be sent every time
                    if (profile.photos && profile.photos[0]) {
                        existingUser.photo = profile.photos[0].value;
                    }
                    await existingUser.save();
                    return done(null, existingUser);
                }

                // Create new user
                const newUser = await new User({
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    photo: (profile.photos && profile.photos[0]) ? profile.photos[0].value : null,
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                }).save();

                done(null, newUser);
            } catch (err) {
                console.error('Error in Google Strategy:', err);
                done(err, null);
            }
        }
    )
);
