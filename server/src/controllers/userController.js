import User from '../models/userModel';
import Profile from '../models/profileModel';
import Team from '../models/teamModel';

import rp from 'request-promise';

import jwt from 'jwt-simple';

const tokenForUser = (user) => {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, process.env.JWT_SECRET);
}

// Authenticate user when they click on "sign in with Slack" button
const authUser = (req, res) => {
  console.log('Authenticating user!');
  console.log('This is the req.query object:', req.query);

  let options = {
    uri: 'https://slack.com/api/oauth.access',
    method:'GET',
    qs: {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: req.query.code,
      redirect_uri: 'http://localhost:8080/slack/users/auth'
    },
    headers: {
      'User-Agent': 'Request-Promise'
    },
    json: true
  }

  // Make request to Slack Authorization Server to swap
  // auth code for access token
  rp(options)
  .then(body => {
    console.log('response body', body);
    if (body.ok) {
      //TODO: Fix nested promise structure -- this is an antipattern (PM)
      //Check for any team with the slack team id -- if this exists, find or create user
      Team.findOne({ where: { slackTeamId: body.team.id} })
      .then((team) => {
        if (team !== null) {
          findOrCreateUser(body, res);
        } else {
          // TODO: implement this with front end /oops page
          // this is where we handle a user that signs in but their team
          // has not yet installed bot to their slack
          console.log('Team needs to add uncle bot first!');
          res.redirect('/oops');
        }
      });
    } else {
      //TODO: figure out what to do here if response is messed up
      console.log('Network response is not ok');
    }
  })
  .catch(err => {
    console.log('There was an error with the GET request:', err)
    res.redirect('/')
  });
}

//moved findOrCreateUser into its own function
const findOrCreateUser = (body, res) => {
  // find or create user using access token and the info from body
  let name = body.user.name;
  let accessToken = body.access_token;
  let slackUserId = body.user.id;
  let slackTeamId = body.team.id;
  let email = body.user.email;

  //TODO: fix the duplicate user issue
  User.findOrCreate({
    where: { name, slackUserId, slackTeamId, email }
  })
  .spread((user, created) => {
    console.log('Created user?', created);
    user.updateAttributes({ accessToken });
    // TODO: issue the JWT
    // TODO: and store it in the client
    // QUESTION: how do we send it to the client? 
    res.redirect(`/profile`);
  })
  .catch(err => res.send(err));
}

//we have a database of users based on slack bot interaction
//we should be able to find, addUser, deleteUser
const findUser = (req, res) => {
  User.findOne({
    where: {
      name: req.body.username,
      slackId: req.body.slack_id
    }
  })
  .then(user => {
    res.json(user);
  })
  .catch(err => {
    console.log('Error: ', err);
    done(err);
  });
};

//Adduser if not created, otherwise will return user info
//users need to passed as a array even if it's a single user
//accessToken is set to null initially 
const addUser = (req, res) => {
  let users = req.body.users;
  let teamId = req.body.teamId;
  let accessToken = null;

  users.forEach( ({ name, slackUserId, slackTeamId, email }) => {
    
    User.findOrCreate({
      where: { name, accessToken, slackUserId, slackTeamId, email, teamId }
    })
    .spread ((user, created) => {
      let userId = user.id;
      let name = user.name;
      let location = 'San Francisco';

      if(created) {
        console.log(user.name + ' added');
        Profile.findOrCreate({ where: { userId, name, location } })
          .spread((profile, created) => {
            created ? console.log('profile created') : console.log('profile already exists'); 
          })
          .catch(err => console.log(err));
      } else {
        console.log(user.name + ' exists');
      }
    })
    .catch(err => console.log(err));   
  });
}

const deleteUser = (req, res) => {
  User.destroy({
    where: {
      name: req.body.username,
      slackUserId: req.body.slack_id
    }
  })
  .then(user => {
    console.log('deleted user: ', user);
    res.end()
  })
  .catch(err => {
    console.log('Error: ', err);
    done(err);
  })
}


export default { findUser, addUser, deleteUser, authUser };